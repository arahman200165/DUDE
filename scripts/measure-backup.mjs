// Measures Phase 31G encrypted Hub backup and restore (M718): Argon2id cost, `backup create|verify|restore` wall time, file size,
// the Hub's memory cost while it builds a backup (the whole-buffer design) and the event-loop pause a live Hub sees. Baselines for
// trend-spotting on one machine; there is no pass/fail.
//
//   npm run hub:compile && npm run measure:backup          (add `npm run hub:compile:test` once; case 3 uses the test bundle)
//
// Everything runs through the real compiled Hub (dist/hub/dude-hub.cjs) and its real `dude-hub` CLI: `backup create` two-step over the
// admin pipe (passphrase via DUDE_HUB_BACKUP_PASSPHRASE), the offline `backup verify` / `backup restore`. No Windows service is installed,
// so no elevation is needed. Synthetic databases are written straight into a STOPPED Hub's data/dude.db with node:sqlite (after the Hub
// created its schema), shaped like commitCanonical's output: records + change_feed + applied_ops rows (~1 KiB JSON payloads over the real
// sync entity types) plus audit rows. No owner or devices are seeded (they are tiny and not what grows).
//
// Case 3 (event-loop blocking) needs a 20 ms /api/v1/hello probe, which the release Hub's per-address rate limit (burst 60, 300/min)
// would answer with 429s; it therefore runs the SAME code from the test bundle (dist/hub-test, DUDE_HUB_TEST_RELAX_RATE_LIMITS=1).
// Everything else uses the release bundle. Results go to stdout (a markdown table plus JSON) and dist/measurements/backup.json.
//
//   --large-records <n>   records in the large case (default 100000; audit rows are n/5)
//   --medium-records <n>  records in the medium case (default 10000; audit rows are n/2)
import { execFile, spawn } from 'node:child_process';
import { argon2, createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { performance } from 'node:perf_hooks';
import { DatabaseSync } from 'node:sqlite';

const root = path.resolve(import.meta.dirname, '..');
const HUB_BUNDLE = path.join(root, 'dist', 'hub', 'dude-hub.cjs');
const HUB_TEST_BUNDLE = path.join(root, 'dist', 'hub-test', 'dude-hub.cjs');
const PASSPHRASE = 'measure-backup passphrase 2026';
const OLD_HUB_GONE = 'THE OLD HUB IS GONE';
const CLI_TIMEOUT_MS = 10 * 60_000;
const HUB_START_TIMEOUT_MS = 60_000;
const MEMORY_POLL_MS = 100;
const PROBE_INTERVAL_MS = 20;
const MIB = 1024 * 1024;
const KDF = { memoryKiB: 65536, passes: 3, parallelism: 1, tagLength: 32 };
const MAX_PLAINTEXT_MIB = 512; // MAX_BACKUP_PLAINTEXT_BYTES in @dude/hub-backup

const argValue = (name, fallback) => {
  const at = process.argv.indexOf(name);
  return at >= 0 ? Number(process.argv[at + 1]) : fallback;
};
const SIZES = [
  { name: 'small', records: 0, audit: 0 },
  { name: 'medium', records: argValue('--medium-records', 10_000), audit: Math.round(argValue('--medium-records', 10_000) / 2) },
  { name: 'large', records: argValue('--large-records', 100_000), audit: Math.round(argValue('--large-records', 100_000) / 5) },
];

const log = (message) => process.stderr.write(`[measure-backup] ${message}\n`);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const round = (value, digits = 1) => Math.round(value * 10 ** digits) / 10 ** digits;
const mib = (bytes) => round(bytes / MIB, 1);

// --- cleanup -----------------------------------------------------------------------------------------------------------------

const tempDirs = [];
const children = new Set();
const tempDir = (prefix) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
};
const removeDir = (dir) => rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
const killAll = () => { for (const child of children) { try { child.kill(); } catch { /* already gone */ } } };
process.on('exit', killAll);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { killAll(); process.exit(130); });

// --- statistics --------------------------------------------------------------------------------------------------------------

function percentile(sorted, q) {
  if (sorted.length === 0) return null;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))];
}
function summarize(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  return { n: sorted.length, p50: round(percentile(sorted, 0.5), 2), p95: round(percentile(sorted, 0.95), 2), max: round(sorted.at(-1) ?? 0, 2) };
}

// --- memory probe (external process memory) ----------------------------------------------------------------------------------

/** One persistent helper answers "pid in, working set / private bytes / lifetime peak out", so 100 ms sampling is cheap. */
async function createMemoryProbe() {
  if (process.platform !== 'win32') {
    return {
      query: (pid) => new Promise((resolve) => {
        execFile('ps', ['-o', 'rss=', '-p', String(pid)], (error, out) => {
          const kib = Number(String(out).trim());
          resolve(error || !Number.isFinite(kib) ? null : { ws: kib * 1024, priv: null, peak: null });
        });
      }),
      close: () => {},
    };
  }
  const script = "$ErrorActionPreference='SilentlyContinue'; while (($l = [Console]::In.ReadLine()) -ne $null) { $p = Get-Process -Id ([int]$l); if ($p) { [Console]::Out.WriteLine([string]::Format('{0} {1} {2}', $p.WorkingSet64, $p.PrivateMemorySize64, $p.PeakWorkingSet64)) } else { [Console]::Out.WriteLine('gone') } }";
  const helper = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true });
  children.add(helper);
  const waiting = [];
  createInterface({ input: helper.stdout }).on('line', (line) => waiting.shift()?.(line));
  const query = (pid) => new Promise((resolve) => {
    waiting.push((line) => {
      const [ws, priv, peak] = line.split(' ').map(Number);
      resolve(line === 'gone' || !Number.isFinite(ws) ? null : { ws, priv, peak });
    });
    helper.stdin.write(`${pid}\n`);
  });
  const warm = await Promise.race([query(process.pid), sleep(30_000).then(() => null)]);
  if (warm === null) throw new Error('The PowerShell memory helper did not answer.');
  return { query, close: () => { children.delete(helper); helper.kill(); } };
}

/** Polls a process every MEMORY_POLL_MS until stopped; reports the maximum working set / private bytes seen and its lifetime peak. */
function sampleMemory(probe, pid) {
  const samples = [];
  let running = true;
  const loop = (async () => {
    while (running) {
      const sample = await probe.query(pid);
      if (sample) samples.push(sample);
      await sleep(MEMORY_POLL_MS);
    }
  })();
  return {
    async stop() {
      running = false;
      await loop;
      const last = await probe.query(pid);
      if (last) samples.push(last);
      const max = (key) => samples.reduce((m, s) => (s[key] !== null && s[key] > m ? s[key] : m), 0);
      return {
        samples: samples.length,
        maxWorkingSetMiB: mib(max('ws')),
        maxPrivateMiB: samples.some((s) => s.priv !== null) ? mib(max('priv')) : null,
        lifetimePeakWorkingSetMiB: samples.some((s) => s.peak !== null) ? mib(max('peak')) : null,
      };
    },
  };
}

// --- Hub and CLI processes ---------------------------------------------------------------------------------------------------

function helloRequest(hub, agent) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      host: '127.0.0.1', port: hub.port, servername: 'localhost', path: '/api/v1/hello', agent, timeout: 60_000,
      // The Hub's certificate chains to its own local CA, which this loopback-only measurement does not trust: pin the SPKI instead.
      rejectUnauthorized: false, checkServerIdentity: (_host, cert) => (createHash('sha256').update(cert.pubkey).digest('base64url') === hub.spki ? undefined : new Error('Unexpected Hub certificate.')),
      headers: { host: `localhost:${hub.port}` },
    }, (res) => {
      res.resume();
      res.on('end', () => resolve(res.statusCode ?? 0));
    });
    req.on('timeout', () => req.destroy(new Error('hello timed out')));
    req.on('error', reject);
    req.end();
  });
}

/** Spawns the Hub; resolves once `/api/v1/hello` answers 200. `listenMs` is the `listening` log line, `helloMs` the first answer. */
async function startHub(bundle, dataDir, env = {}) {
  const started = performance.now();
  const child = spawn(process.execPath, [bundle, 'run', '--data-dir', dataDir, '--port', '0'], {
    stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, env: { ...process.env, ...env },
  });
  children.add(child);
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-4000); });
  const listening = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error(`Hub did not listen in ${HUB_START_TIMEOUT_MS / 1000} s. ${stderr}`)); }, HUB_START_TIMEOUT_MS);
    child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`Hub exited early (${code}). ${stderr}`)); });
    createInterface({ input: child.stdout }).on('line', (line) => {
      try {
        const parsed = JSON.parse(line);
        if (parsed.event === 'listening') { clearTimeout(timer); child.removeAllListeners('exit'); resolve({ port: Number(new URL(parsed.url).port), spki: parsed.spkiSha256, at: performance.now() }); }
      } catch { /* a log line */ }
    });
  });
  const hub = { child, pid: child.pid, port: listening.port, spki: listening.spki, listenMs: listening.at - started, helloMs: 0 };
  const agent = new https.Agent({ keepAlive: false });
  for (;;) {
    try {
      if (await helloRequest(hub, agent) === 200) break;
    } catch { /* not yet */ }
    if (performance.now() - started > HUB_START_TIMEOUT_MS) throw new Error('Hub never answered hello.');
    await sleep(10);
  }
  hub.helloMs = performance.now() - started;
  agent.destroy();
  return hub;
}

async function stopHub(hub) {
  if (hub.child.exitCode === null) {
    const exited = new Promise((resolve) => hub.child.once('exit', resolve));
    hub.child.kill();
    await Promise.race([exited, sleep(10_000)]);
  }
  children.delete(hub.child);
  await sleep(300); // let Windows release the file handles on the database
}

/** Runs `node dude-hub.cjs <args>` and resolves with its wall time, exit code and output. Bounded by CLI_TIMEOUT_MS. */
function runCli(bundle, args, { env = {}, watch = null } = {}) {
  return new Promise((resolve, reject) => {
    const started = performance.now();
    const child = spawn(process.execPath, [bundle, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, env: { ...process.env, DUDE_HUB_BACKUP_PASSPHRASE: PASSPHRASE, ...env },
    });
    children.add(child);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-4000); });
    const timer = setTimeout(() => { child.kill(); reject(new Error(`dude-hub ${args.slice(0, 2).join(' ')} did not finish in ${CLI_TIMEOUT_MS / 60_000} min.`)); }, CLI_TIMEOUT_MS);
    const sampler = watch ? sampleMemory(watch, child.pid) : null;
    child.on('exit', async (code) => {
      clearTimeout(timer);
      children.delete(child);
      const ms = performance.now() - started;
      const memory = sampler ? await sampler.stop() : null;
      resolve({ ms, code, stdout, stderr, memory });
    });
  });
}

function lastJson(text) {
  try { return JSON.parse(text.trim()); } catch { /* several lines: the last JSON line */ }
  for (const line of text.trim().split(/\r?\n/).reverse()) {
    try { return JSON.parse(line); } catch { /* not JSON */ }
  }
  throw new Error(`No JSON in CLI output: ${text.slice(0, 300)}`);
}
function expectOk(result, what) {
  if (result.code !== 0) throw new Error(`${what} failed (exit ${result.code}): ${result.stderr}`);
  return result;
}

// --- synthetic database ------------------------------------------------------------------------------------------------------

const ENTITY_MIX = [
  ['setting', 40], ['favorite', 10], ['pipeline', 15], ['user-script', 10], ['project', 8], ['workspace-template', 7], ['scratchpad', 5], ['usage', 5],
];
const AUDIT_EVENTS = ['sync.pushed', 'sync.snapshot', 'device.token-issued', 'sync.state-reported', 'auth.failure'];
const WORDS = 'alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima mike november oscar papa quebec romeo sierra tango uniform victor whiskey xray yankee zulu parse format encode decode token header query route build deploy cache index'.split(' ');
const TARGET_PAYLOAD_BYTES = 1024;

function makePayload(type, index) {
  const base = { id: `${type}-${index}`, name: `${type} ${index}`, tags: [WORDS[index % WORDS.length], WORDS[(index * 7) % WORDS.length]], updatedAt: new Date().toISOString() };
  const free = Math.max(0, TARGET_PAYLOAD_BYTES - JSON.stringify({ ...base, notes: '', blob: '' }).length);
  let notes = '';
  for (let w = index; notes.length < free / 2; w += 3) notes += `${WORDS[w % WORDS.length]} `;
  const blob = randomBytes(Math.ceil((free / 2) * 0.75)).toString('base64').slice(0, Math.floor(free / 2));
  return JSON.stringify({ ...base, notes: notes.trim(), blob });
}

/** Writes records + change_feed + applied_ops + audit_events straight into a stopped Hub's database (what commitCanonical / audit() write). */
function seedDatabase(dbFile, { records, audit }) {
  const db = new DatabaseSync(dbFile);
  try {
    db.exec('PRAGMA synchronous = OFF');
    const now = Date.now();
    let environmentId = db.prepare('SELECT environment_id AS id FROM environment LIMIT 1').get()?.id;
    if (environmentId === undefined) {
      environmentId = 'measure-environment';
      db.prepare('INSERT INTO environment(environment_id, display_name, created_at) VALUES(?, ?, ?)').run(environmentId, 'Measure', new Date(now).toISOString());
    }
    const firstRevision = Number(db.prepare('SELECT COALESCE(MAX(revision), 0) AS r FROM change_feed').get().r) + 1;
    const insertRecord = db.prepare('INSERT INTO records(environment_id, entity_type, entity_id, scope, schema_version, revision, payload_json, deleted, updated_at, updated_by_device_id) VALUES(?, ?, ?, ?, ?, ?, ?, 0, ?, ?)');
    const insertFeed = db.prepare('INSERT INTO change_feed(revision, environment_id, entity_type, entity_id, op, device_id, op_id, at) VALUES(?, ?, ?, ?, ?, ?, ?, ?)');
    const insertOp = db.prepare('INSERT INTO applied_ops(op_id, revision, device_id, applied_at) VALUES(?, ?, ?, ?)');
    const insertAudit = db.prepare('INSERT INTO audit_events(at, actor_kind, actor_id, event, outcome, ip, detail_json) VALUES(?, ?, ?, ?, ?, ?, ?)');
    const types = ENTITY_MIX.flatMap(([type, weight]) => Array(weight).fill(type));
    const BATCH = 5000;
    for (let start = 0; start < records; start += BATCH) {
      db.exec('BEGIN');
      for (let i = start; i < Math.min(records, start + BATCH); i++) {
        const type = types[i % types.length];
        const id = `${type}-${i}`;
        const at = new Date(now - (records - i) * 1000).toISOString();
        const device = `device-${i % 3}`;
        const opId = `op-${randomBytes(12).toString('hex')}`;
        const revision = firstRevision + i;
        insertRecord.run(environmentId, type, id, 'environment', 1, revision, makePayload(type, i), at, device);
        insertFeed.run(revision, environmentId, type, id, 'upsert', device, opId, at);
        insertOp.run(opId, revision, device, at);
      }
      db.exec('COMMIT');
    }
    for (let start = 0; start < audit; start += BATCH) {
      db.exec('BEGIN');
      for (let i = start; i < Math.min(audit, start + BATCH); i++) {
        const at = new Date(now - (audit - i) * 5000).toISOString();
        const detail = JSON.stringify({ entityType: ENTITY_MIX[i % ENTITY_MIX.length][0], ops: (i % 20) + 1, applied: (i % 20) + 1, rejected: 0, snapshot: i % 97 === 0, route: '/api/v1/sync/push' });
        insertAudit.run(at, 'device', `device-${i % 3}`, AUDIT_EVENTS[i % AUDIT_EVENTS.length], 'success', '127.0.0.1', detail);
      }
      db.exec('COMMIT');
    }
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  } finally {
    db.close();
  }
}

const fileSize = (file) => (existsSync(file) ? statSync(file).size : 0);
const dbPath = (dataDir) => path.join(dataDir, 'data', 'dude.db');

// --- measurements ------------------------------------------------------------------------------------------------------------

/** Case 1: Argon2id with the default backup parameters, median of 5, with the process's peak resident-set growth while it runs. */
async function measureArgon2() {
  const runs = [];
  let peakRss = 0;
  const baselineRss = process.memoryUsage().rss;
  const poll = setInterval(() => { peakRss = Math.max(peakRss, process.memoryUsage().rss); }, 5);
  try {
    for (let i = 0; i < 5; i++) {
      const started = performance.now();
      await new Promise((resolve, reject) => {
        argon2('argon2id', { message: PASSPHRASE, nonce: randomBytes(16), parallelism: KDF.parallelism, tagLength: KDF.tagLength, memory: KDF.memoryKiB, passes: KDF.passes },
          (error, key) => (error ? reject(error) : resolve(key)));
      });
      runs.push(performance.now() - started);
    }
  } finally {
    clearInterval(poll);
  }
  const sorted = [...runs].sort((a, b) => a - b);
  return {
    params: `argon2id m=${KDF.memoryKiB} KiB (64 MiB), t=${KDF.passes}, p=${KDF.parallelism}`,
    medianMs: round(sorted[2], 1), minMs: round(sorted[0], 1), maxMs: round(sorted[4], 1), runsMs: runs.map((r) => round(r, 1)),
    peakMemoryNote: `64 MiB working set by construction (m = 65536 KiB, allocated natively per derivation); this process's RSS grew by ${mib(Math.max(0, peakRss - baselineRss))} MiB at peak`,
  };
}

/** Case 2 for one size. */
async function measureSize(size, probe, state) {
  log(`${size.name}: creating a Hub and its schema...`);
  const hubDir = tempDir(`dude-measure-backup-${size.name}-`);
  const folder = tempDir(`dude-measure-backup-${size.name}-out-`);
  const restoreDir = tempDir(`dude-measure-backup-${size.name}-restored-`);
  const result = { size: size.name, records: size.records, auditRows: size.audit };

  const fresh = await startHub(HUB_BUNDLE, hubDir);
  result.freshHubColdStart = { listenMs: round(fresh.listenMs), helloMs: round(fresh.helloMs) };
  await stopHub(fresh);

  if (size.records > 0 || size.audit > 0) {
    log(`${size.name}: seeding ${size.records} records, ${size.audit} audit rows...`);
    const started = performance.now();
    seedDatabase(dbPath(hubDir), size);
    result.seedMs = round(performance.now() - started, 0);
  }
  result.liveDbBytes = fileSize(dbPath(hubDir));
  result.liveDbMiB = mib(result.liveDbBytes);

  log(`${size.name}: starting the Hub on the seeded data...`);
  const hub = await startHub(HUB_BUNDLE, hubDir);
  result.hubStartSeeded = { listenMs: round(hub.listenMs), helloMs: round(hub.helloMs) };
  try {
    if (size.name === 'small') {
      const list = [];
      for (let i = 0; i < 3; i++) list.push(expectOk(await runCli(HUB_BUNDLE, ['backup', 'list', '--folder', folder, '--data-dir', hubDir]), 'backup list').ms);
      result.cliAdminRoundTripMs = round([...list].sort((a, b) => a - b)[1]);
    }
    await sleep(1000);
    const idle = await probe.query(hub.pid);
    result.hubIdleWorkingSetMiB = mib(idle?.ws ?? 0);
    result.hubIdlePrivateMiB = idle?.priv == null ? null : mib(idle.priv);

    log(`${size.name}: backup create...`);
    const common = ['backup', 'create', '--folder', folder, '--data-dir', hubDir];
    const createMemory = sampleMemory(probe, hub.pid);
    const preview = expectOk(await runCli(HUB_BUNDLE, common), 'backup create (preview)');
    const token = lastJson(preview.stdout).confirmToken;
    const apply = expectOk(await runCli(HUB_BUNDLE, [...common, '--confirm', token]), 'backup create (apply)');
    result.hubMemoryDuringCreate = await createMemory.stop();
    result.createPreviewMs = round(preview.ms);
    result.createApplyMs = round(apply.ms);
    const created = lastJson(apply.stdout);
    result.backupFile = path.basename(created.file);
    result.backupBytes = created.size;
    result.backupMiB = mib(created.size);
    result.backupToDbRatio = round(created.size / result.liveDbBytes, 3);

    log(`${size.name}: backup verify...`);
    const verifyMemory = sampleMemory(probe, hub.pid);
    const verify = expectOk(await runCli(HUB_BUNDLE, ['backup', 'verify', '--file', created.file, '--data-dir', hubDir]), 'backup verify');
    result.hubMemoryDuringVerify = await verifyMemory.stop();
    result.verifyMs = round(verify.ms);
    result.verifyCounts = lastJson(verify.stdout).counts ?? null;

    await stopHub(hub);
    state.main = { hubDir, folder, file: created.file };

    log(`${size.name}: backup restore into a fresh directory...`);
    const restoreArgs = ['backup', 'restore', '--file', created.file, '--data-dir', restoreDir];
    const restorePreview = expectOk(await runCli(HUB_BUNDLE, restoreArgs, { watch: probe }), 'backup restore (preview)');
    const restoreToken = lastJson(restorePreview.stdout).confirmToken;
    const restoreApply = expectOk(await runCli(HUB_BUNDLE, [...restoreArgs, '--confirm', restoreToken, '--old-hub-gone', OLD_HUB_GONE], { watch: probe }), 'backup restore (apply)');
    result.restorePreviewMs = round(restorePreview.ms);
    result.restoreApplyMs = round(restoreApply.ms);
    result.restoreTotalMs = round(restorePreview.ms + restoreApply.ms);
    result.restoreCliPeakWorkingSetMiB = Math.max(restorePreview.memory?.maxWorkingSetMiB ?? 0, restoreApply.memory?.maxWorkingSetMiB ?? 0);
    result.restoredDbBytes = fileSize(dbPath(restoreDir));

    log(`${size.name}: starting the restored Hub...`);
    const restored = await startHub(HUB_BUNDLE, restoreDir);
    result.restoredHubStart = { listenMs: round(restored.listenMs), helloMs: round(restored.helloMs) };
    await stopHub(restored);
  } finally {
    await stopHub(hub);
  }
  return result;
}

/** Case 3: probe /api/v1/hello every 20 ms while `backup create` (and `backup verify`) run against the large database on a live Hub. */
async function measureEventLoop(mainState, size) {
  log('event loop: starting the test-bundle Hub on the large database...');
  const folder = tempDir('dude-measure-backup-loop-out-');
  const hub = await startHub(HUB_TEST_BUNDLE, mainState.hubDir, { DUDE_HUB_TEST_RELAX_RATE_LIMITS: '1' });
  const agent = new https.Agent({ keepAlive: true, maxSockets: 1 });
  const probeWindow = () => {
    const latencies = [];
    const statuses = {};
    let errors = 0;
    let running = true;
    const loop = (async () => {
      while (running) {
        const t0 = performance.now();
        try {
          const status = await helloRequest(hub, agent);
          latencies.push(performance.now() - t0);
          statuses[status] = (statuses[status] ?? 0) + 1;
        } catch { errors++; }
        const wait = PROBE_INTERVAL_MS - (performance.now() - t0);
        if (wait > 0) await sleep(wait);
      }
    })();
    return { async stop() { running = false; await loop; return { ...summarize(latencies), statuses, errors }; } };
  };
  try {
    await sleep(1000);
    const idle = probeWindow();
    await sleep(4000);
    const idleStats = await idle.stop();

    const common = ['backup', 'create', '--folder', folder, '--data-dir', mainState.hubDir];
    const preview = expectOk(await runCli(HUB_TEST_BUNDLE, common), 'backup create (preview, loop)');
    const token = lastJson(preview.stdout).confirmToken;
    const window = probeWindow();
    const apply = expectOk(await runCli(HUB_TEST_BUNDLE, [...common, '--confirm', token]), 'backup create (apply, loop)');
    const createStats = await window.stop();

    const verifyWindow = probeWindow();
    const verify = expectOk(await runCli(HUB_TEST_BUNDLE, ['backup', 'verify', '--file', lastJson(apply.stdout).file, '--data-dir', mainState.hubDir]), 'backup verify (loop)');
    const verifyStats = await verifyWindow.stop();
    return {
      note: 'one outstanding GET /api/v1/hello every 20 ms over one keep-alive connection (latency in ms); test bundle with rate limits relaxed, otherwise the same code as the release Hub',
      records: size.records,
      idleBaseline: idleStats,
      duringCreateApply: { ...createStats, applyWallMs: round(apply.ms) },
      duringVerify: { ...verifyStats, verifyWallMs: round(verify.ms) },
    };
  } finally {
    agent.destroy();
    await stopHub(hub);
  }
}

/** Supplement to case 3: the synchronous part itself, `VACUUM INTO` of the stopped large database, twice as createScrubbedDbSnapshot does. */
function measureVacuum(dataDir) {
  const work = tempDir('dude-measure-backup-vacuum-');
  const first = path.join(work, 'first.tmp');
  const second = path.join(work, 'second.tmp');
  const db = new DatabaseSync(dbPath(dataDir));
  let firstMs;
  let secondMs;
  try {
    const t0 = performance.now();
    db.exec(`VACUUM INTO '${first.replace(/'/g, "''")}'`);
    firstMs = performance.now() - t0;
  } finally {
    db.close();
  }
  const copy = new DatabaseSync(first);
  try {
    copy.exec('PRAGMA journal_mode = DELETE');
    const t1 = performance.now();
    copy.exec(`VACUUM INTO '${second.replace(/'/g, "''")}'`);
    secondMs = performance.now() - t1;
  } finally {
    copy.close();
  }
  const readStarted = performance.now();
  const bytes = readFileSync(second);
  const readMs = performance.now() - readStarted;
  return { firstVacuumIntoMs: round(firstMs, 0), secondVacuumIntoMs: round(secondMs, 0), readSnapshotMs: round(readMs, 0), snapshotBytes: bytes.length };
}

// --- reporting ---------------------------------------------------------------------------------------------------------------

function markdown(report) {
  const rows = report.sizes;
  const cols = rows.map((r) => `${r.size} (${r.records.toLocaleString('en-US')} rec / ${r.auditRows.toLocaleString('en-US')} audit)`);
  const line = (label, fn) => `| ${label} | ${rows.map(fn).join(' | ')} |`;
  const lines = [];
  lines.push('## Phase 31G backup measurements', '');
  lines.push(`- Machine: ${report.machine.cpu} (${report.machine.logicalCpus} logical), ${report.machine.totalMemGiB} GiB RAM, ${report.machine.os}, Node ${report.machine.node}`);
  lines.push(`- Generated: ${report.generatedAt}; Hub bundle: dist/hub/dude-hub.cjs (release); backup format limit ${MAX_PLAINTEXT_MIB} MiB plaintext`);
  if (report.reduced.length > 0) lines.push(`- REDUCED: ${report.reduced.join('; ')}`);
  lines.push('', '### 1. Argon2id key derivation', '');
  lines.push(`${report.argon2.params}: median ${report.argon2.medianMs} ms (min ${report.argon2.minMs}, max ${report.argon2.maxMs}; runs ${report.argon2.runsMs.join(', ')}).`);
  lines.push(`Memory: ${report.argon2.peakMemoryNote}.`);
  lines.push('', '### 2. Backup and restore by database size', '');
  lines.push(`| Metric | ${cols.join(' | ')} |`, `| --- | ${cols.map(() => '---:').join(' | ')} |`);
  lines.push(line('Live dude.db (MiB)', (r) => r.liveDbMiB));
  lines.push(line('Hub start, seeded data: listening / hello (ms)', (r) => `${r.hubStartSeeded.listenMs} / ${r.hubStartSeeded.helloMs}`));
  lines.push(line('`backup create` preview (ms, incl. CLI start)', (r) => r.createPreviewMs));
  lines.push(line('`backup create` apply (ms, incl. CLI start)', (r) => r.createApplyMs));
  lines.push(line('.dudebackup size (MiB)', (r) => r.backupMiB));
  lines.push(line('Backup / live db size ratio', (r) => r.backupToDbRatio));
  lines.push(line('`backup verify` (ms)', (r) => r.verifyMs));
  lines.push(line('`backup restore` preview (ms)', (r) => r.restorePreviewMs));
  lines.push(line('`backup restore` apply (ms)', (r) => r.restoreApplyMs));
  lines.push(line('`backup restore` total (ms)', (r) => r.restoreTotalMs));
  lines.push(line('Restored Hub start (new TLS identity): listening / hello (ms)', (r) => `${r.restoredHubStart.listenMs} / ${r.restoredHubStart.helloMs}`));
  lines.push(line('Hub working set idle (MiB)', (r) => r.hubIdleWorkingSetMiB));
  lines.push(line('Hub working set max during create (MiB, 100 ms samples)', (r) => r.hubMemoryDuringCreate.maxWorkingSetMiB));
  lines.push(line('Hub private bytes max during create (MiB)', (r) => r.hubMemoryDuringCreate.maxPrivateMiB));
  lines.push(line('Hub lifetime peak working set after create (MiB)', (r) => r.hubMemoryDuringCreate.lifetimePeakWorkingSetMiB));
  lines.push(line('Hub working set max during verify (MiB)', (r) => r.hubMemoryDuringVerify.maxWorkingSetMiB));
  lines.push(line('Restore CLI working set max (MiB)', (r) => r.restoreCliPeakWorkingSetMiB));
  const large = rows.find((r) => r.size === 'large');
  if (large && large.hubMemoryDuringCreate.lifetimePeakWorkingSetMiB !== null) {
    const plainMiB = large.liveDbMiB;
    const growth = large.hubMemoryDuringCreate.lifetimePeakWorkingSetMiB - large.hubIdleWorkingSetMiB;
    lines.push('', `Whole-buffer cost (large): peak working set grew ${round(growth)} MiB over idle for a ${plainMiB} MiB database, about ${round(growth / plainMiB, 1)}x the database; at the ${MAX_PLAINTEXT_MIB} MiB ceiling that extrapolates to roughly ${Math.round((growth / plainMiB) * MAX_PLAINTEXT_MIB + large.hubIdleWorkingSetMiB)} MiB peak working set.`);
  }
  if (report.eventLoop) {
    const e = report.eventLoop;
    lines.push('', '### 3. Event-loop blocking on a live Hub (large database)', '');
    lines.push(`${e.note}.`, '', '| Window | requests | p50 (ms) | p95 (ms) | max (ms) | non-200 / errors |', '| --- | ---: | ---: | ---: | ---: | --- |');
    for (const [label, w] of [['idle baseline', e.idleBaseline], ['during `backup create` apply', e.duringCreateApply], ['during `backup verify`', e.duringVerify]]) {
      lines.push(`| ${label} | ${w.n} | ${w.p50} | ${w.p95} | ${w.max} | ${JSON.stringify(w.statuses)} / ${w.errors} |`);
    }
    if (report.vacuum) lines.push('', `Synchronous \`VACUUM INTO\` of the large database, measured directly: first ${report.vacuum.firstVacuumIntoMs} ms, second (scrubbed copy) ${report.vacuum.secondVacuumIntoMs} ms, snapshot read ${report.vacuum.readSnapshotMs} ms (${mib(report.vacuum.snapshotBytes)} MiB).`);
  }
  return lines.join('\n');
}

async function main() {
  if (!existsSync(HUB_BUNDLE)) throw new Error('dist/hub/dude-hub.cjs is missing; run `npm run hub:compile` first.');
  const skipLoop = !existsSync(HUB_TEST_BUNDLE);
  if (skipLoop) log('dist/hub-test/dude-hub.cjs is missing (npm run hub:compile:test); the event-loop case will be skipped.');
  const cpus = os.cpus();
  const report = {
    generatedAt: new Date().toISOString(),
    machine: { cpu: cpus[0]?.model.trim() ?? 'unknown', logicalCpus: cpus.length, totalMemGiB: round(os.totalmem() / 1024 ** 3, 1), os: `${os.version()} (${os.release()}, ${process.platform}-${process.arch})`, node: process.version },
    reduced: SIZES.flatMap((s, i) => (s.name === 'medium' && s.records !== 10_000) || (s.name === 'large' && s.records !== 100_000) ? [`${s.name} uses ${s.records} records and ${s.audit} audit rows`] : []),
    argon2: null, sizes: [], eventLoop: null, vacuum: null,
  };
  const probe = await createMemoryProbe();
  try {
    log('Argon2id...');
    report.argon2 = await measureArgon2();
    const state = {};
    for (const size of SIZES) {
      report.sizes.push(await measureSize(size, probe, state));
      if (size.name !== 'large') {
        // The directories of the smaller cases are no longer needed; the large one is kept for case 3.
        removeDir(state.main.hubDir);
        removeDir(state.main.folder);
      }
    }
    if (!skipLoop) {
      report.eventLoop = await measureEventLoop(state.main, SIZES.at(-1));
      report.vacuum = measureVacuum(state.main.hubDir);
    }
  } finally {
    probe.close();
  }
  const outFile = path.join(root, 'dist', 'measurements', 'backup.json');
  mkdirSync(path.dirname(outFile), { recursive: true });
  writeFileSync(outFile, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${markdown(report)}\n\n<details><summary>JSON (also in dist/measurements/backup.json)</summary>\n\n\`\`\`json\n${JSON.stringify(report, null, 2)}\n\`\`\`\n\n</details>\n`);
}

try {
  await main();
} finally {
  killAll();
  await sleep(500);
  for (const dir of tempDirs) removeDir(dir);
}
