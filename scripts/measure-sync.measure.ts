/* Sync measurements; run through scripts/measure-sync.mjs. Records numbers, asserts nothing about them. */
import { generateKeyPairSync, randomBytes, randomUUID, sign } from 'node:crypto';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { afterAll, it } from 'vitest';
import { createHubClient } from '@dude/api-client';
import type { HubRequest, HubResponse, HubTransport } from '@dude/api-client';
import { HUB_MIN_CLIENT_PROTOCOL, HUB_PROTOCOL_VERSION, deviceAuthMessage, enrollMessage, parsePairingString } from '@dude/contracts/hub';
import type { SyncOp, SyncOpResult } from '@dude/contracts/hub';
import { uuidv7 } from '@dude/persistence';
import { SYNC_LIMITS } from '@dude/sync';
import { createPinnedTransport, spkiSha256Of } from '../apps/device-agent/src/hub/pinned-transport.js';
import { commitEntity, importMany } from '../apps/device-agent/src/store/entity-commit.js';
import { cleanupTemp, commitContext, openReady, tempDir } from '../apps/device-agent/src/testing/test-utils.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const BUNDLE = path.join(ROOT, 'dist', 'hub', 'dude-hub.cjs');
const PASSWORD = 'correct horse battery staple';
const log = (m: string): void => { process.stderr.write(`[measure-sync] ${m}\n`); };
const r2 = (n: number): number => Math.round(n * 100) / 100;
const dirs: string[] = [];
const procs: ChildProcess[] = [];

// --- Hub process -------------------------------------------------------------------------------------------------

interface Hub { child: ChildProcess; port: number; dir: string; cert: string; startMs: number }

async function startHub(dir: string): Promise<Hub> {
  const started = performance.now();
  const child = spawn(process.execPath, [BUNDLE, 'run', '--data-dir', dir, '--port', '0'], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  procs.push(child);
  let out = '';
  child.stderr?.on('data', (c: Buffer) => { out += c.toString(); });
  const port = await new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Hub did not start: ${out}`)), 60_000);
    child.on('exit', (code) => { clearTimeout(timer); reject(new Error(`Hub exited (${code}): ${out}`)); });
    let buf = '';
    child.stdout?.on('data', (c: Buffer) => {
      buf += c.toString();
      for (const line of buf.split('\n')) {
        try {
          const p = JSON.parse(line) as { event?: string; url?: string };
          if (p.event === 'listening' && p.url) { clearTimeout(timer); resolve(Number(new URL(p.url).port)); }
        } catch { /* not the listening line */ }
      }
    });
  });
  child.removeAllListeners('exit');
  return { child, port, dir, cert: readFileSync(path.join(dir, 'config', 'tls', 'cert.pem'), 'utf8'), startMs: performance.now() - started };
}

async function stopHub(hub: Hub): Promise<void> {
  if (hub.child.exitCode !== null) return;
  const exited = new Promise<void>((resolve) => hub.child.once('exit', () => resolve()));
  hub.child.kill();
  await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 10_000))]);
}

// --- Throttle-aware client ---------------------------------------------------------------------------------------
// The Hub's global rate limit (300/min, burst 60 per IP) is part of the product. Waiting out a 429 is not sync cost, so it
// is counted separately and excluded from every reported time.

const throttle = { ms: 0, count: 0 };
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function transportFor(hub: Hub): HubTransport {
  const inner = createPinnedTransport({ host: '127.0.0.1', port: hub.port, ca: [hub.cert], pins: [spkiSha256Of(hub.cert)] });
  return {
    async request(req: HubRequest): Promise<HubResponse> {
      for (;;) {
        const res = await inner.request(req);
        if (res.status !== 429) return res;
        const wait = Math.max(1, Number(res.headers['retry-after'] ?? 1)) * 1000;
        throttle.count++;
        throttle.ms += wait;
        await sleep(wait);
      }
    },
  };
}

/** Wall time of `fn` minus time spent waiting out 429s. */
async function timed<T>(fn: () => Promise<T>): Promise<{ ms: number; value: T }> {
  const t0 = throttle.ms;
  const start = performance.now();
  const value = await fn();
  return { ms: r2(performance.now() - start - (throttle.ms - t0)), value };
}

type Api = ReturnType<typeof createHubClient>;

class Sim {
  readonly deviceId = randomUUID();
  token = '';
  private readonly key = generateKeyPairSync('ed25519');
  private readonly pub = (this.key.publicKey.export({ format: 'jwk' }) as { x: string }).x;
  private readonly sign = (m: string): string => sign(null, Buffer.from(m, 'utf8'), this.key.privateKey).toString('base64url');

  async enroll(api: Api, pairingCode: string): Promise<void> {
    const h = await api.hello();
    await api.enroll({
      pairingCode,
      device: { deviceId: this.deviceId, displayName: 'measure', platform: 'windows', appVersion: '0.0.0-measure', protocolVersion: HUB_PROTOCOL_VERSION, capabilities: [] },
      publicKey: this.pub,
      signature: this.sign(enrollMessage({ hubInstanceId: h.hubInstanceId, pairingCode, deviceId: this.deviceId, publicKey: this.pub })),
    });
    const { nonce } = await api.deviceChallenge(this.deviceId);
    this.token = (await api.deviceToken({ deviceId: this.deviceId, nonce, signature: this.sign(deviceAuthMessage({ hubInstanceId: h.hubInstanceId, nonce, deviceId: this.deviceId })) })).accessToken;
  }
}

interface Env { hub: Hub; api: Api; pair: () => Promise<Sim> }

/** A fresh, bootstrapped Hub so growth numbers start from a known state and the rate-limit bucket is full. */
async function freshEnv(): Promise<Env> {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'dude-measure-sync-'));
  dirs.push(dir);
  const hub = await startHub(dir);
  const transport = transportFor(hub);
  const api = createHubClient(transport, { clientProtocol: HUB_PROTOCOL_VERSION, minHubProtocol: HUB_MIN_CLIENT_PROTOCOL });
  const setupToken = readFileSync(path.join(hub.dir, 'config', 'setup-token'), 'utf8').trim();
  await api.bootstrap({ setupToken, ownerDisplayName: 'Owner', environmentName: 'Measure', password: PASSWORD });
  const signIn = await transport.request({ method: 'POST', path: '/api/v1/auth/sign-in', body: { password: PASSWORD } });
  const cookie = String(signIn.headers['set-cookie']).split(';')[0]!;
  const csrf = String((signIn.body as { csrfToken: string }).csrfToken);
  const pair = async (): Promise<Sim> => {
    const res = await transport.request({
      method: 'POST', path: '/api/v1/pairing-codes', body: { host: '127.0.0.1' },
      headers: { cookie, origin: `https://127.0.0.1:${hub.port}`, 'x-dude-csrf': csrf },
    });
    const parsed = parsePairingString(String((res.body as { pairingString: string }).pairingString));
    if (!parsed) throw new Error(`pairing failed: ${res.status}`);
    const sim = new Sim();
    await sim.enroll(api, parsed.code);
    return sim;
  };
  return { hub, api, pair };
}

// --- Payload builders --------------------------------------------------------------------------------------------

let opCounter = 0;
const opId = (): string => `m-${(++opCounter).toString(36)}-${randomBytes(6).toString('hex')}`;

const favoritePayload = (i: number, tag = 'f'): { id: string; kind: 'tool'; targetId: string; order: number; pinnedAt: string } =>
  ({ id: `tool:${tag}${i}`, kind: 'tool', targetId: `${tag}${i}`, order: i, pinnedAt: '2026-01-01T00:00:00.000Z' });
const favoriteOp = (i: number, tag = 'f'): SyncOp => {
  const payload = favoritePayload(i, tag);
  return { opId: opId(), entityType: 'favorite', entityId: payload.id, opKind: 'upsert', schemaVersion: 1, basedOnRevision: null, payload };
};

/** A pipeline of `steps` steps (about 3 KB at 20 steps). */
const pipelinePayload = (i: number, steps = 20, name = `Pipeline ${i}`): Record<string, unknown> => ({
  schemaVersion: 1, id: `pl-${i}`, name, description: 'Measurement pipeline with a representative description of what it does.',
  steps: Array.from({ length: steps }, (_, s) => ({ kind: 'tool', stepId: `step-${i}-${s}`, toolId: `tool-${s % 7}`, label: `Step number ${s}` })),
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
});
const pipelineOp = (i: number, over: Partial<SyncOp> = {}, payload: unknown = pipelinePayload(i)): SyncOp =>
  ({ opId: opId(), entityType: 'pipeline', entityId: `pl-${i}`, opKind: 'upsert', schemaVersion: 1, basedOnRevision: null, payload, ...over });

const bytes = (v: unknown): number => Buffer.byteLength(JSON.stringify(v), 'utf8');

/** Splits ops into push batches by SYNC_LIMITS.maxPushOps and maxPushBytes (body = `{"ops":[...]}`). */
function batch(ops: SyncOp[]): SyncOp[][] {
  const out: SyncOp[][] = [];
  let cur: SyncOp[] = [];
  let size = 10;
  for (const op of ops) {
    const b = bytes(op) + 1;
    if (cur.length > 0 && (cur.length >= SYNC_LIMITS.maxPushOps || size + b > SYNC_LIMITS.maxPushBytes)) { out.push(cur); cur = []; size = 10; }
    cur.push(op);
    size += b;
  }
  if (cur.length > 0) out.push(cur);
  return out;
}

async function pushAll(env: Env, sim: Sim, ops: SyncOp[]): Promise<{ ms: number; batches: number; bodyBytes: number; statuses: Record<string, number>; results: SyncOpResult[] }> {
  const batches = batch(ops);
  const statuses: Record<string, number> = {};
  const results: SyncOpResult[] = [];
  const { ms } = await timed(async () => {
    for (const b of batches) {
      const res = await env.api.syncPush(sim.token, b);
      for (const r of res.results) { statuses[r.status] = (statuses[r.status] ?? 0) + 1; results.push(r); }
    }
  });
  return { ms, batches: batches.length, bodyBytes: ops.reduce((n, o) => n + bytes(o), 0), statuses, results };
}

const rate = (n: number, ms: number): number => (ms > 0 ? Math.round((n / ms) * 1000) : 0);

async function pullChanges(env: Env, sim: Sim, after: number): Promise<{ ms: number; pages: number; records: number }> {
  let pages = 0;
  let records = 0;
  const { ms } = await timed(async () => {
    let cursor = after;
    for (;;) {
      const res = await env.api.syncChanges(sim.token, cursor, SYNC_LIMITS.changesPage);
      pages++;
      records += res.changes.length;
      cursor = res.cursor;
      if (!res.hasMore) break;
    }
  });
  return { ms, pages, records };
}

async function pullSnapshot(env: Env, sim: Sim): Promise<{ ms: number; pages: number; records: number }> {
  let pages = 0;
  let records = 0;
  const { ms } = await timed(async () => {
    let next: { afterType: string; afterId: string } | null = null;
    do {
      const res: Awaited<ReturnType<typeof env.api.syncSnapshot>> = await env.api.syncSnapshot(sim.token, { ...(next ?? {}), limit: SYNC_LIMITS.snapshotPage });
      pages++;
      records += res.records.length;
      next = res.next;
    } while (next);
  });
  return { ms, pages, records };
}

const fileSize = (p: string): number => (existsSync(p) ? statSync(p).size : 0);
const dbBytes = (dir: string): { dbBytes: number; walBytes: number } => {
  const f = path.join(dir, 'data', 'dude.db');
  return { dbBytes: fileSize(f), walBytes: fileSize(`${f}-wal`) };
};
const countRows = (dir: string, sql: string): number => {
  const db = new DatabaseSync(path.join(dir, 'data', 'dude.db'), { readOnly: true });
  try { return Number((db.prepare(sql).get() as { c: number }).c); } finally { db.close(); }
};
const dirBytes = (dir: string): number => readdirSync(dir).reduce((n, f) => n + fileSize(path.join(dir, f)), 0);

// --- The measurement ---------------------------------------------------------------------------------------------

const result: Record<string, unknown> = {};

afterAll(async () => {
  cleanupTemp();
  for (const p of procs) { try { p.kill(); } catch { /* gone */ } }
  await sleep(500);
  for (const d of dirs) rmSync(d, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
});

it('measures sync', async () => {
  const total = performance.now();
  const cpus = os.cpus();
  result['generatedAt'] = new Date().toISOString();
  result['machine'] = { os: `${os.type()} ${os.release()}`, platform: `${process.platform}-${process.arch}`, cpu: cpus[0]?.model ?? 'unknown', cores: cpus.length, memoryGiB: r2(os.totalmem() / 2 ** 30), node: process.version };
  result['limits'] = { ...SYNC_LIMITS };
  result['note'] = 'Times are client-observed over loopback HTTPS (include api-client schema validation). Time spent waiting out Hub rate-limit 429s is excluded and reported as throttle.';

  // 1. Push throughput + 2. catch-up, on one Hub that accumulates records.
  log('push throughput and catch-up');
  const env = await freshEnv();
  const a = await env.pair();
  const b = await env.pair();
  const before = { ...dbBytes(env.hub.dir), changeFeedRows: countRows(env.hub.dir, 'SELECT COUNT(*) AS c FROM change_feed'), recordRows: countRows(env.hub.dir, 'SELECT COUNT(*) AS c FROM records') };

  const push: Record<string, unknown> = {};
  const catchUp: Record<string, unknown> = {};
  for (const n of [100, 1_000, 5_000]) {
    const p = await pushAll(env, a, Array.from({ length: n }, (_, i) => favoriteOp(i, `n${n}-`)));
    push[`favorites${n}`] = { records: n, ms: p.ms, recordsPerSec: rate(n, p.ms), batches: p.batches, avgPayloadBytes: Math.round(p.bodyBytes / n), statuses: p.statuses };
  }
  const pp = await pushAll(env, a, Array.from({ length: 100 }, (_, i) => pipelineOp(i)));
  push['pipelines100'] = { records: 100, ms: pp.ms, recordsPerSec: rate(100, pp.ms), batches: pp.batches, avgPayloadBytes: Math.round(pp.bodyBytes / 100), statuses: pp.statuses };

  const head = (await env.api.syncChanges(a.token, 0, 1)).headRevision;
  const fresh = await env.pair();
  const fromZero = await pullChanges(env, fresh, 0);
  const fromMid = await pullChanges(env, b, Math.floor(head / 2));
  const snap = await pullSnapshot(env, fresh);
  catchUp['headRevision'] = head;
  catchUp['changesFromCursor0'] = { ...fromZero, recordsPerSec: rate(fromZero.records, fromZero.ms) };
  catchUp['changesFromMidCursor'] = { ...fromMid, recordsPerSec: rate(fromMid.records, fromMid.ms) };
  catchUp['snapshot'] = { ...snap, recordsPerSec: rate(snap.records, snap.ms) };
  result['push'] = push;
  result['catchUp'] = catchUp;

  // 3. Conflicts: pipelines are merge3; device B edits `name`, then A pushes a different `name` against the stale base.
  log('conflicts');
  const M = 100;
  const created = await pushAll(env, a, Array.from({ length: M }, (_, i) => pipelineOp(1000 + i)));
  const revs = created.results.map((r) => (r.status === 'applied' ? r.revision : -1));
  await pushAll(env, b, Array.from({ length: M }, (_, i) => pipelineOp(1000 + i, { basedOnRevision: revs[i]! }, pipelinePayload(1000 + i, 20, `Renamed by B ${i}`))));
  const stale = await pushAll(env, a, Array.from({ length: M }, (_, i) => pipelineOp(1000 + i, { basedOnRevision: revs[i]! }, pipelinePayload(1000 + i, 20, `Renamed by A ${i}`))));
  const clean = await pushAll(env, a, Array.from({ length: M }, (_, i) => pipelineOp(2000 + i)));
  result['conflicts'] = {
    staleBaseOps: M, ms: stale.ms, opsPerSec: rate(M, stale.ms), batches: stale.batches, statuses: stale.statuses,
    referenceCleanPushOfSameSizeMs: clean.ms,
  };

  // 5. Record-size boundary (a pipeline name is the padded field).
  log('record size boundary');
  const sized = (target: number, id: number): SyncOp => {
    const empty = bytes(pipelinePayload(id, 0, ''));
    return pipelineOp(id, {}, pipelinePayload(id, 0, 'x'.repeat(target - empty)));
  };
  const boundary: Record<string, unknown> = { maxRecordBytes: SYNC_LIMITS.maxRecordBytes };
  for (const [label, target, id] of [['atLimit', SYNC_LIMITS.maxRecordBytes, 3001], ['limitPlus1', SYNC_LIMITS.maxRecordBytes + 1, 3002], ['limitMinus1', SYNC_LIMITS.maxRecordBytes - 1, 3003]] as const) {
    const op = sized(target, id);
    const res = await env.api.syncPush(a.token, [op]);
    const r = res.results[0]!;
    boundary[label] = { payloadBytes: bytes(op.payload), status: r.status, ...(r.status === 'rejected' ? { reason: r.reason } : {}) };
  }
  const over = Array.from({ length: Math.ceil(SYNC_LIMITS.maxPushBytes / SYNC_LIMITS.maxRecordBytes) + 1 }, (_, i) => sized(SYNC_LIMITS.maxRecordBytes, 3100 + i));
  try {
    const res = await env.api.syncPush(a.token, over);
    boundary['bodyOverMaxPushBytes'] = { bodyBytes: bytes({ ops: over }), accepted: res.results.map((r) => r.status) };
  } catch (error) {
    boundary['bodyOverMaxPushBytes'] = { bodyBytes: bytes({ ops: over }), refusedStatus: (error as { status?: number }).status ?? String(error), code: (error as { code?: string }).code };
  }
  result['recordBoundary'] = boundary;

  // 4a. Hub growth.
  const after = {
    ...dbBytes(env.hub.dir),
    changeFeedRows: countRows(env.hub.dir, 'SELECT COUNT(*) AS c FROM change_feed'),
    recordRows: countRows(env.hub.dir, 'SELECT COUNT(*) AS c FROM records'),
    appliedOpRows: countRows(env.hub.dir, 'SELECT COUNT(*) AS c FROM applied_ops'),
  };
  const growth: Record<string, unknown> = { beforePush: before, afterPush: after, livePayloadBytes: countRows(env.hub.dir, 'SELECT COALESCE(SUM(LENGTH(payload_json)), 0) AS c FROM records') };

  // 4b. Compaction: stop, age every change-feed/applied-op row past retention, restart (compaction runs on startup).
  log('hub compaction');
  await stopHub(env.hub);
  const warm = await startHub(env.hub.dir);
  await stopHub(warm);
  const dbFile = path.join(env.hub.dir, 'data', 'dude.db');
  const raw = new DatabaseSync(dbFile);
  const old = new Date(Date.now() - 200 * 24 * 3600_000).toISOString();
  raw.prepare('UPDATE change_feed SET at = ?').run(old);
  raw.prepare('UPDATE applied_ops SET applied_at = ?').run(old);
  raw.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  raw.close();
  const sizeBeforeCompaction = dbBytes(env.hub.dir);
  const compacted = await startHub(env.hub.dir);
  await stopHub(compacted);
  const audit = new DatabaseSync(dbFile, { readOnly: true });
  const ev = audit.prepare("SELECT detail_json FROM audit_events WHERE event = 'sync.compacted' ORDER BY seq DESC LIMIT 1").get() as { detail_json?: string } | undefined;
  audit.close();
  growth['compaction'] = {
    method: 'compaction runs at Hub startup; time is the compacting restart minus a baseline restart with nothing to compact',
    baselineRestartMs: r2(warm.startMs), compactingRestartMs: r2(compacted.startMs), estimatedCompactionMs: r2(compacted.startMs - warm.startMs),
    removed: ev?.detail_json ? JSON.parse(ev.detail_json) : null,
    sizeBeforeCompaction, sizeAfterCompaction: dbBytes(env.hub.dir),
    changeFeedRowsAfter: countRows(env.hub.dir, 'SELECT COUNT(*) AS c FROM change_feed'),
    fileSizeNote: 'SQLite does not shrink the file on DELETE; freed pages are reused, so the file size is expected to stay about the same',
  };
  result['hubGrowth'] = growth;
  result['throttle'] = { waitedMs: throttle.ms, count: throttle.count };

  // 4c. Device store: pending-op growth.
  log('device store outbox growth');
  const device: Record<string, unknown> = {};
  const newId = (): string => uuidv7((k) => new Uint8Array(randomBytes(k)), () => Date.now());
  for (const n of [100, 1_000, 5_000]) {
    const dir = tempDir();
    const store = openReady(dir);
    const ctx = commitContext(store, { newOpId: newId, maxOutboxRows: 1_000_000 });
    const emptyBytes = dirBytes(dir);
    const t0 = performance.now();
    for (let i = 0; i < n; i++) commitEntity(store.db, ctx, { entityType: 'favorite', entityId: `tool:f${i}`, op: 'upsert', payload: favoritePayload(i) });
    const commitMs = performance.now() - t0;
    const countOutbox = (): number => Number((store.db.prepare('SELECT COUNT(*) AS c FROM outbox').get() as { c: number }).c);
    const rows = countOutbox();
    const t1 = performance.now();
    for (let i = 0; i < n; i++) commitEntity(store.db, ctx, { entityType: 'favorite', entityId: `tool:f${i}`, op: 'upsert', payload: { ...favoritePayload(i), order: i + 1 } });
    const reEditMs = performance.now() - t1;
    const rowsAfterEdit = countOutbox();
    store.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    const store2 = openReady(tempDir());
    const ctx2 = commitContext(store2, { newOpId: newId, maxOutboxRows: 1_000_000 });
    const t2 = performance.now();
    importMany(store2.db, ctx2, Array.from({ length: n }, (_, i) => ({ entityType: 'favorite', entityId: `tool:f${i}`, op: 'upsert' as const, payload: favoritePayload(i) })));
    const importMs = performance.now() - t2;
    device[`favorites${n}`] = {
      pendingOps: n, outboxRows: rows, outboxRowsAfterReEditingAll: rowsAfterEdit,
      commitEntityLoopMs: r2(commitMs), perCommitMs: r2(commitMs / n), reEditLoopMs: r2(reEditMs), importManyMs: r2(importMs),
      storeBytesEmpty: emptyBytes, storeBytesAfter: dirBytes(dir),
    };
  }
  result['deviceStore'] = device;
  result['totalRuntimeSec'] = r2((performance.now() - total) / 1000);

  mkdirSync(path.join(ROOT, 'dist', 'measurements'), { recursive: true });
  writeFileSync(path.join(ROOT, 'dist', 'measurements', 'sync.json'), `${JSON.stringify(result, null, 2)}\n`);
});
