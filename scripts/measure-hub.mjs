// Measures the Hub and the Device Agent (Phase 31C, M647): startup, request latency and Agent pipe cost.
//
//   npm run hub:compile && npm run device-agent:compile && npm run measure:hub
//
// N runs of each case (default 5, `--runs <n>` to change), median and p95 printed as JSON and written to
// dist/measurements/hub.json. The numbers are for trend-spotting on one machine, not budgets; there is no pass/fail.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import https from 'node:https';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { performance } from 'node:perf_hooks';
import { connectAgentPipe } from '@dude/agent-pipe';

const root = path.resolve(import.meta.dirname, '..');
const HUB_BUNDLE = path.join(root, 'dist', 'hub', 'dude-hub.cjs');
const HUB_EXE = path.join(root, 'dist', 'hub', 'dude-hub.exe');
const AGENT_BUNDLE = path.join(root, 'dist', 'electron', 'device-agent.js');
const runsArg = process.argv.indexOf('--runs');
const N = runsArg >= 0 ? Number(process.argv[runsArg + 1]) : 5;
const HELLO_REQUESTS = 20;
const KV_ENTRIES = 1000;
const KV_BATCH = 100;

const tempDirs = [];
const tempDir = (prefix) => {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
};

function summarize(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const at = (q) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))];
  const round = (v) => Math.round(v * 100) / 100;
  return { runs: sorted.length, medianMs: round(at(0.5)), p95Ms: round(at(0.95)), minMs: round(sorted[0]), maxMs: round(sorted.at(-1)) };
}

/** Spawns the Hub and resolves with the time to its `listening` line. */
function startHub(command, args, dataDir) {
  return new Promise((resolve, reject) => {
    const started = performance.now();
    const child = spawn(command, [...args, 'run', '--data-dir', dataDir, '--port', '0'], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let stderr = '';
    child.stderr.on('data', (c) => (stderr += c));
    const timer = setTimeout(() => { child.kill(); reject(new Error(`Hub did not start in 60 s. ${stderr}`)); }, 60_000);
    child.on('exit', (code) => reject(new Error(`Hub exited early (${code}). ${stderr}`)));
    createInterface({ input: child.stdout }).on('line', (line) => {
      try {
        const parsed = JSON.parse(line);
        if (parsed.event === 'listening') {
          clearTimeout(timer);
          child.removeAllListeners('exit');
          resolve({ child, ms: performance.now() - started, port: Number(new URL(parsed.url).port) });
        }
      } catch { /* log line */ }
    });
  });
}

function stop(child) {
  return new Promise((resolve) => {
    if (child.exitCode !== null) return resolve();
    child.once('exit', () => resolve());
    child.kill();
    setTimeout(resolve, 10_000).unref();
  });
}

const removeDir = (dir) => rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });

async function measureHubStart(label, command, args) {
  const cold = [];
  let warmDir = null;
  for (let i = 0; i < N; i++) {
    const dir = tempDir('dude-measure-hub-');
    const hub = await startHub(command, args, dir);
    cold.push(hub.ms);
    await stop(hub.child);
    if (i === 0) warmDir = dir;
    else removeDir(dir);
  }
  const warm = [];
  for (let i = 0; i < N; i++) {
    const hub = await startHub(command, args, warmDir);
    warm.push(hub.ms);
    await stop(hub.child);
  }
  return { label, cold: summarize(cold), warm: summarize(warm) };
}

async function measureHello(command, args) {
  const dir = tempDir('dude-measure-hello-');
  const hub = await startHub(command, args, dir);
  try {
    const ca = readFileSync(path.join(dir, 'config', 'tls', 'cert.pem'), 'utf8');
    const request = (agent) => new Promise((resolve, reject) => {
      const started = performance.now();
      const req = https.request({ host: '127.0.0.1', port: hub.port, servername: 'localhost', path: '/api/v1/hello', ca, agent, headers: { host: `localhost:${hub.port}` } }, (res) => {
        res.resume();
        res.on('end', () => resolve(performance.now() - started));
      });
      req.on('error', reject);
      req.end();
    });
    const keepAlive = [];
    const fresh = [];
    for (let run = 0; run < N; run++) {
      const agent = new https.Agent({ keepAlive: true, maxSockets: 1 });
      for (let i = 0; i < HELLO_REQUESTS; i++) keepAlive.push(await request(agent));
      agent.destroy();
      const noKeepAlive = new https.Agent({ keepAlive: false });
      for (let i = 0; i < HELLO_REQUESTS; i++) fresh.push(await request(noKeepAlive));
    }
    return { requestsPerRun: HELLO_REQUESTS, keepAliveConnection: summarize(keepAlive), newConnectionEachRequest: summarize(fresh) };
  } finally {
    await stop(hub.child);
  }
}

const AGENT_CONFIG = {
  appInfo: { appVersion: '0.0.0-measure', platform: 'windows', os: '10.0', arch: 'x64' },
  capabilities: { desktop: true, secureStorage: false },
  machineGuid: null,
};

async function connectWithRetry(storeDir, deadlineMs = 30_000) {
  const until = performance.now() + deadlineMs;
  for (;;) {
    try {
      return await connectAgentPipe({ storeDir, config: AGENT_CONFIG, timeoutMs: 10_000 });
    } catch (error) {
      if (performance.now() > until) throw error;
      await new Promise((r) => setTimeout(r, 20));
    }
  }
}

/** Spawns the agent and resolves with the time until the first connection completes its handshake. */
async function startAgent(storeDir) {
  const started = performance.now();
  const child = spawn(process.execPath, [AGENT_BUNDLE, '--store-dir', storeDir], { stdio: 'ignore', windowsHide: true });
  const client = await connectWithRetry(storeDir);
  return { child, client, ms: performance.now() - started };
}

async function timeIt(fn) {
  const started = performance.now();
  await fn();
  return performance.now() - started;
}

async function measureAgent() {
  const spawnToReadyEmpty = [];
  const connectWarm = [];
  const hydrateEmpty = [];
  const spawnToReadySeeded = [];
  const hydrateSeeded = [];
  const seedMs = [];

  for (let run = 0; run < N; run++) {
    const storeDir = tempDir('dude-measure-agent-');
    const agent = await startAgent(storeDir);
    spawnToReadyEmpty.push(agent.ms);
    agent.client.close();
    const client = await connectWithRetry(storeDir);
    connectWarm.push(await timeIt(async () => (await connectWithRetry(storeDir)).close()));
    hydrateEmpty.push(await timeIt(() => client.call('store.hydrate', {})));
    hydrateEmpty.push(await timeIt(() => client.call('store.hydrate', {})));

    seedMs.push(await timeIt(async () => {
      for (let start = 0; start < KV_ENTRIES; start += KV_BATCH) {
        const mutations = Array.from({ length: KV_BATCH }, (_, i) => ({
          namespace: `tool.measure-${(start + i) % 50}`,
          key: `key-${start + i}`,
          value: { n: start + i, text: 'x'.repeat(64) },
          policy: 'local',
        }));
        await client.call('kv.commit', { mutations }, 30_000);
      }
    }));
    hydrateSeeded.push(await timeIt(() => client.call('store.hydrate', {}, 30_000)));
    hydrateSeeded.push(await timeIt(() => client.call('store.hydrate', {}, 30_000)));
    client.close();
    await stop(agent.child);

    // Restart on the seeded store: process start + store open + first handshake.
    const restarted = await startAgent(storeDir);
    spawnToReadySeeded.push(restarted.ms);
    restarted.client.close();
    await stop(restarted.child);
  }
  return {
    kvEntriesSeeded: KV_ENTRIES,
    spawnToFirstHandshakeEmptyStore: summarize(spawnToReadyEmpty),
    connectAndHandshakeToRunningAgent: summarize(connectWarm),
    hydrateEmptyStore: summarize(hydrateEmpty),
    seedViaKvCommitTotal: summarize(seedMs),
    hydrateSeededStore: summarize(hydrateSeeded),
    spawnToFirstHandshakeSeededStore: summarize(spawnToReadySeeded),
  };
}

async function main() {
  if (!existsSync(HUB_BUNDLE)) throw new Error('dist/hub/dude-hub.cjs is missing; run `npm run hub:compile` first.');
  if (!existsSync(AGENT_BUNDLE)) throw new Error('dist/electron/device-agent.js is missing; run `npm run device-agent:compile` first.');

  const result = { generatedAt: new Date().toISOString(), node: process.version, platform: `${process.platform}-${process.arch}`, runs: N };

  console.error('Hub start (node bundle)...');
  const nodeHub = await measureHubStart('node dist/hub/dude-hub.cjs', process.execPath, [HUB_BUNDLE]);
  result.hubStartNode = nodeHub;
  // The database layer is not reachable on its own from the bundle (the CLI only opens it as part of `run`), so the
  // migration cost is the cold-minus-warm difference: cold also creates the database, applies every migration,
  // generates the TLS identity and its self-test and writes the layout; warm skips all of that.
  result.migrationAndFirstRunEstimate = {
    note: 'cold start minus warm start (migrations + TLS keygen + self-test + layout); not isolated, the bundle exposes no migration-only entry point',
    medianMs: Math.round((nodeHub.cold.medianMs - nodeHub.warm.medianMs) * 100) / 100,
  };

  if (existsSync(HUB_EXE)) {
    console.error('Hub start (SEA executable)...');
    result.hubStartSea = await measureHubStart('dist/hub/dude-hub.exe', HUB_EXE, []);
  } else {
    result.hubStartSea = { skipped: 'dist/hub/dude-hub.exe does not exist (npm run hub:sea builds it)' };
  }

  console.error('Hub hello latency...');
  result.helloRoundTrip = await measureHello(process.execPath, [HUB_BUNDLE]);

  console.error('Device Agent pipe...');
  result.deviceAgent = await measureAgent();

  const outFile = path.join(root, 'dist', 'measurements', 'hub.json');
  mkdirSync(path.dirname(outFile), { recursive: true });
  const json = `${JSON.stringify(result, null, 2)}\n`;
  writeFileSync(outFile, json);
  process.stdout.write(json);
}

try {
  await main();
} finally {
  for (const dir of tempDirs) removeDir(dir);
}
