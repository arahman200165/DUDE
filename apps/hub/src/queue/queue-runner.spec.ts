import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { PermanentJobError } from './job-error.js';
import type { JobHandlers } from './job-kinds.js';
import { createQueueRunner } from './queue-runner.js';
import type { QueueRunner, RunnerJobRegistry } from './queue-runner.js';
import { openQueueFixture } from './queue-fixture.js';
import { createDefaultJobHandlers } from './handlers.js';
import { openBlobFixture } from '../blobs/blob-fixture.js';
import { createJobQueue } from './job-queue.js';
import { createWorkerPool } from '../workers/worker-pool.js';
import type { WorkerPool } from '../workers/worker-pool.js';
import { buildTestWorkerBundle, testWorkerCommand } from '../workers/test-worker-bundle.js';

const fast = { pollMs: 20, maintenanceMs: 60_000, leaseMs: 300 };
const open: Array<{ close(): void }> = [];
const runners: QueueRunner[] = [];
const pools: WorkerPool[] = [];
const fixture = (...args: Parameters<typeof openQueueFixture>) => { const f = openQueueFixture(...args); open.push(f); return f; };
let bundle = '';
beforeAll(async () => { bundle = await buildTestWorkerBundle(); }, 60_000);
afterEach(async () => {
  for (const runner of runners.splice(0)) await runner.stop();
  for (const pool of pools.splice(0)) await pool.shutdown();
  for (const f of open.splice(0)) f.close();
});

const until = async (check: () => boolean, ms = 8000): Promise<void> => {
  const end = Date.now() + ms;
  while (!check() && Date.now() < end) await new Promise((resolve) => setTimeout(resolve, 15));
  if (!check()) throw new Error('condition not reached in time');
};
const runnerOf = (options: Parameters<typeof createQueueRunner>[0]): QueueRunner => {
  const runner = createQueueRunner({ ...fast, ...options });
  runners.push(runner);
  return runner;
};
const workerPool = async (): Promise<WorkerPool> => {
  const f = fixture();
  const pool = createWorkerPool({ scratchRoot: path.join(f.paths.workersDir), command: testWorkerCommand(bundle), crashBackoff: { baseMs: 1, maxMs: 5 } });
  await pool.start();
  pools.push(pool);
  return pool;
};

/** Backoff of a few milliseconds and the real clock, so retries happen within a spec. */
const realClock = () => fixture({ now: Date.now, backoff: { baseMs: 20, maxMs: 40 } });

const inlineHandlers = (log: string[] = []): JobHandlers => ({
  'inline.ok': { isolation: 'inline', timeoutMs: 2000, run: async ({ job }) => { log.push(`ok:${job.attempt}`); return { summary: 'fine', data: { n: 1 } }; } },
  'inline.fail': { isolation: 'inline', timeoutMs: 2000, run: async ({ job }) => { log.push(`fail:${job.attempt}`); throw new Error('nope'); } },
  'inline.permanent': { isolation: 'inline', timeoutMs: 2000, run: async () => { throw new PermanentJobError('never'); } },
  'inline.slow': { isolation: 'inline', timeoutMs: 100, run: async ({ signal }) => { await new Promise((resolve, reject) => { const t = setTimeout(resolve, 5000); signal.addEventListener('abort', () => { clearTimeout(t); reject(signal.reason as Error); }, { once: true }); }); return { summary: 'late' }; } },
  'inline.attention': { isolation: 'inline', timeoutMs: 2000, hubJobId: 'blobs-verify', run: async () => ({ summary: '1 corrupt', attention: true }) },
});

describe('inline handlers', () => {
  it('runs a queued job and records its result', async () => {
    const f = realClock();
    const id = f.queue.enqueue({ kind: 'inline.ok' }).id;
    const runner = runnerOf({ queue: f.queue, handlers: inlineHandlers() });
    runner.start();
    await until(() => f.row(id)['state'] === 'succeeded');
    expect(f.row(id)).toMatchObject({ attempts: 1, result_json: '{"summary":"fine","data":{"n":1}}', lease_owner: null });
  });

  it('retries a failing job with backoff and dead-letters it after max_attempts', async () => {
    const f = realClock();
    const log: string[] = [];
    const id = f.queue.enqueue({ kind: 'inline.fail', maxAttempts: 3 }).id;
    runnerOf({ queue: f.queue, handlers: inlineHandlers(log) }).start();
    await until(() => f.row(id)['state'] === 'dead');
    expect(log).toEqual(['fail:1', 'fail:2', 'fail:3']);
    expect(f.row(id)).toMatchObject({ attempts: 3, last_error: 'nope' });
  });

  it('ends a permanent failure as failed without retrying, and never claims a kind it has no handler for', async () => {
    const f = realClock();
    const permanent = f.queue.enqueue({ kind: 'inline.permanent' }).id;
    const orphan = f.queue.enqueue({ kind: 'test.echo' }).id;
    runnerOf({ queue: f.queue, handlers: inlineHandlers() }).start();
    await until(() => f.row(permanent)['state'] === 'failed');
    expect(f.row(permanent)).toMatchObject({ attempts: 1, last_error: 'never' });
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(f.row(orphan)).toMatchObject({ state: 'queued', attempts: 0 });
  });

  it('times out an inline handler through its signal and retries it', async () => {
    const f = realClock();
    const id = f.queue.enqueue({ kind: 'inline.slow', maxAttempts: 1 }).id;
    runnerOf({ queue: f.queue, handlers: inlineHandlers() }).start();
    await until(() => f.row(id)['state'] === 'dead');
    expect(String(f.row(id)['last_error'])).toContain('did not finish within 100 ms');
  });

  it('renews the lease while a job runs (a job longer than its lease is not recovered underneath its runner)', async () => {
    const f = realClock();
    const handlers: JobHandlers = { 'inline.ok': { isolation: 'inline', timeoutMs: 5000, run: async () => { await new Promise((resolve) => setTimeout(resolve, 900)); return { summary: 'long' }; } } };
    const id = f.queue.enqueue({ kind: 'inline.ok' }).id;
    const runner = runnerOf({ queue: f.queue, handlers, leaseMs: 300, maintenanceMs: 100 });
    runner.start();
    const recovered = setInterval(() => { f.queue.recoverExpired(); }, 50);
    try { await until(() => f.row(id)['state'] === 'succeeded'); } finally { clearInterval(recovered); }
    expect(f.row(id)).toMatchObject({ attempts: 1 });
  });

  it('respects the concurrency limit', async () => {
    const f = realClock();
    let active = 0;
    let peak = 0;
    const handlers: JobHandlers = { 'inline.ok': { isolation: 'inline', timeoutMs: 5000, run: async () => { active += 1; peak = Math.max(peak, active); await new Promise((resolve) => setTimeout(resolve, 80)); active -= 1; return { summary: 'x' }; } } };
    for (let i = 0; i < 6; i += 1) f.queue.enqueue({ kind: 'inline.ok' });
    runnerOf({ queue: f.queue, handlers, concurrency: 2 }).start();
    await until(() => Number((f.db.prepare("SELECT COUNT(*) AS n FROM jobs WHERE state = 'succeeded'").get() as { n: number }).n) === 6);
    expect(peak).toBe(2);
  });
});

describe('crash recovery', () => {
  it('returns a job a dead runner left leased to the queue at start and runs it', async () => {
    const f = fixture({ now: Date.now, backoff: { baseMs: 20, maxMs: 40 } });
    const id = f.queue.enqueue({ kind: 'inline.ok' }).id;
    expect(f.queue.claim('previous-hub-process', { leaseMs: 50 })).toBeDefined();
    await new Promise((resolve) => setTimeout(resolve, 80));
    const log: string[] = [];
    runnerOf({ queue: f.queue, handlers: inlineHandlers(log) }).start();
    await until(() => f.row(id)['state'] === 'succeeded');
    expect(log).toEqual(['ok:2']);
  });

  it('gives a running job back without losing an attempt when the runner stops', async () => {
    const f = realClock();
    const handlers: JobHandlers = { 'inline.slow': { isolation: 'inline', timeoutMs: 60_000, run: async ({ signal }) => { await new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason as Error), { once: true })); return { summary: 'x' }; } } };
    const id = f.queue.enqueue({ kind: 'inline.slow' }).id;
    const runner = runnerOf({ queue: f.queue, handlers });
    runner.start();
    await until(() => f.row(id)['state'] === 'running');
    await runner.stop();
    expect(f.row(id)).toMatchObject({ state: 'queued', attempts: 0, lease_owner: null });
  });

  it('records the interruption as a notable queue-runner run', () => {
    const f = fixture();
    const reports: Array<[string, string, string]> = [];
    const registry: RunnerJobRegistry = { register: () => undefined, track: (_id, run) => run(), report: (id, outcome, summary) => { reports.push([id, outcome, summary]); } };
    f.queue.enqueue({ kind: 'inline.ok', maxAttempts: 1 });
    f.queue.claim('gone', { leaseMs: 10 });
    f.advance(20);
    const runner = runnerOf({ queue: f.queue, handlers: inlineHandlers(), registry });
    expect(runner.maintain()).toBe('1 job gave up after repeated interruptions.');
    expect(reports).toEqual([['queue-runner', 'success', '1 job gave up after repeated interruptions.']]);
  });
});

describe('worker handlers', () => {
  const workerHandlers = (): JobHandlers => ({
    'test.echo': { isolation: 'worker', timeoutMs: 15_000, memoryLimitMb: 256 },
    'test.flaky': { isolation: 'worker', timeoutMs: 15_000, memoryLimitMb: 256 },
    'test.crash': { isolation: 'worker', timeoutMs: 15_000, memoryLimitMb: 256 },
    'test.sleep': { isolation: 'worker', timeoutMs: 400, memoryLimitMb: 256 },
    'test.oom': { isolation: 'worker', timeoutMs: 60_000, memoryLimitMb: 48 },
    'test.permanent': { isolation: 'worker', timeoutMs: 15_000, memoryLimitMb: 256 },
  });

  it('runs a worker job in a child and stores the result', async () => {
    const f = realClock();
    const id = f.queue.enqueue({ kind: 'test.echo', payload: { hello: 'world' } }).id;
    runnerOf({ queue: f.queue, handlers: workerHandlers(), workers: await workerPool() }).start();
    await until(() => f.row(id)['state'] === 'succeeded');
    expect(JSON.parse(String(f.row(id)['result_json']))).toEqual({ summary: 'Echoed.', data: { echo: { hello: 'world' } } });
  });

  it('retries a job whose worker crashed and succeeds on the next attempt', async () => {
    const f = realClock();
    const id = f.queue.enqueue({ kind: 'test.flaky' }).id;
    runnerOf({ queue: f.queue, handlers: workerHandlers(), workers: await workerPool() }).start();
    await until(() => f.row(id)['state'] === 'succeeded');
    expect(f.row(id)).toMatchObject({ attempts: 2 });
    expect(JSON.parse(String(f.row(id)['result_json'])).summary).toBe('Succeeded on attempt 2.');
  });

  it('dead-letters a job whose worker always crashes', async () => {
    const f = realClock();
    const id = f.queue.enqueue({ kind: 'test.crash', maxAttempts: 2 }).id;
    runnerOf({ queue: f.queue, handlers: workerHandlers(), workers: await workerPool() }).start();
    await until(() => f.row(id)['state'] === 'dead');
    expect(f.row(id)).toMatchObject({ attempts: 2 });
    expect(String(f.row(id)['last_error'])).toContain('exited unexpectedly');
  });

  it('kills a worker at its timeout and retries it', async () => {
    const f = realClock();
    const id = f.queue.enqueue({ kind: 'test.sleep', payload: { ms: 60_000 }, maxAttempts: 2 }).id;
    runnerOf({ queue: f.queue, handlers: workerHandlers(), workers: await workerPool() }).start();
    await until(() => f.row(id)['state'] === 'dead');
    expect(String(f.row(id)['last_error'])).toContain('did not finish within 400 ms');
  });

  it('ends a worker that exceeds its memory limit as failed (no retry)', async () => {
    const f = realClock();
    const id = f.queue.enqueue({ kind: 'test.oom', maxAttempts: 3 }).id;
    runnerOf({ queue: f.queue, handlers: workerHandlers(), workers: await workerPool() }).start();
    await until(() => f.row(id)['state'] === 'failed', 60_000);
    expect(f.row(id)).toMatchObject({ attempts: 1 });
    expect(String(f.row(id)['last_error'])).toContain('48 MiB');
  }, 90_000);

  it('ends a permanent worker error as failed, and leaves no worker process when the runner stops mid-job', async () => {
    const f = realClock();
    const permanent = f.queue.enqueue({ kind: 'test.permanent' }).id;
    const pool = await workerPool();
    const handlers: JobHandlers = { ...workerHandlers(), 'test.sleep': { isolation: 'worker', timeoutMs: 60_000, memoryLimitMb: 256 } };
    const sleeper = f.queue.enqueue({ kind: 'test.sleep', payload: { ms: 60_000 } }).id;
    const runner = runnerOf({ queue: f.queue, handlers, workers: pool });
    runner.start();
    await until(() => f.row(permanent)['state'] === 'failed');
    await until(() => pool.activePids().length === 1);
    const pids = pool.activePids();
    await runner.stop();
    expect(f.row(sleeper)).toMatchObject({ state: 'queued', attempts: 0 });
    await until(() => pids.every((pid) => { try { process.kill(pid, 0); return false; } catch { return true; } }));
    expect(pool.activePids()).toEqual([]);
  });
});

describe('scheduled jobs and the job registry', () => {
  it('queues a scheduled job once per interval, idempotently, and persists the schedule across restarts', () => {
    const f = fixture();
    const runner = runnerOf({ queue: f.queue, handlers: inlineHandlers(), db: f.db, now: f.now, schedules: [{ kind: 'inline.ok', intervalMs: 1000, payload: { s: 1 } }] });
    expect(runner.maintain()).toBe('1 scheduled job queued.');
    expect(runner.maintain()).toBeUndefined();
    f.advance(1500);
    // The first scheduled job is still waiting: the idempotency key keeps it from being queued twice.
    expect(runner.maintain()).toBeUndefined();
    expect(f.db.prepare("SELECT COUNT(*) AS n FROM jobs WHERE kind = 'inline.ok'").get()).toEqual({ n: 1 });
    const claimed = f.queue.claim('w')!;
    f.queue.complete(claimed.id, 'w');
    f.advance(1500);
    const restarted = runnerOf({ queue: f.queue, handlers: inlineHandlers(), db: f.db, now: f.now, schedules: [{ kind: 'inline.ok', intervalMs: 1000 }] });
    expect(restarted.maintain()).toBe('1 scheduled job queued.');
    expect(f.db.prepare("SELECT COUNT(*) AS n FROM jobs WHERE kind = 'inline.ok'").get()).toEqual({ n: 2 });
  });

  it('tracks a handler with a hub job id in the registry and shows an attention result as failed', async () => {
    const f = realClock();
    const runs: Array<[string, string, string]> = [];
    const registry: RunnerJobRegistry = {
      register: () => undefined,
      track: ((id: string, run: () => Promise<unknown>, classify: (value: never) => { outcome: string; summary: string }) =>
        run().then((value) => { const report = classify(value as never); runs.push([id, report.outcome, report.summary]); return value; })) as unknown as RunnerJobRegistry['track'],
      report: () => undefined,
    };
    f.queue.enqueue({ kind: 'inline.attention' });
    runnerOf({ queue: f.queue, handlers: inlineHandlers(), registry }).start();
    await until(() => runs.length === 1);
    expect(runs).toEqual([['blobs-verify', 'failed', '1 corrupt']]);
  });
});

describe('the blob jobs', () => {
  it('blobs.verify re-hashes the catalogue and reports a corrupt blob through the audit outbox', async () => {
    const blobs = openBlobFixture();
    open.push(blobs);
    const queue = createJobQueue({ db: blobs.db, now: blobs.now });
    const good = await blobs.add('good bytes', 'a1');
    const bad = await blobs.add('bad bytes', 'a2');
    writeFileSync(path.join(blobs.paths.blobsDir, bad.slice(0, 2), bad.slice(2, 4), bad), 'tampered');
    let drained = 0;
    const handlers = createDefaultJobHandlers({ db: blobs.db, blobs: blobs.store, now: blobs.now, drainAudit: () => { drained += 1; } });
    const id = queue.enqueue({ kind: 'blobs.verify', payload: { limit: 10 } }).id;
    const runner = runnerOf({ queue, handlers, pollMs: 20 });
    runner.start();
    await until(() => (blobs.db.prepare('SELECT state FROM jobs WHERE id = ?').get(id) as { state: string }).state === 'succeeded');
    const result = JSON.parse(String((blobs.db.prepare('SELECT result_json FROM jobs WHERE id = ?').get(id) as { result_json: string }).result_json)) as { summary: string; data: Record<string, number> };
    expect(result.data).toEqual({ checked: 2, ok: 1, corrupt: 1, missing: 0 });
    expect(result.summary).toBe('Checked 2; 1 corrupt, 0 missing.');
    expect(blobs.db.prepare('SELECT state FROM blobs WHERE sha256 = ?').get(bad)).toEqual({ state: 'corrupt' });
    expect(blobs.db.prepare('SELECT state FROM blobs WHERE sha256 = ?').get(good)).toEqual({ state: 'ok' });
    expect(drained).toBe(1);
  });

  it('blobs.staging-sweep removes only old .part files, and refuses a window under an hour', async () => {
    const blobs = openBlobFixture();
    open.push(blobs);
    const { mkdirSync, utimesSync } = await import('node:fs');
    mkdirSync(blobs.paths.stagingDir, { recursive: true });
    const old = path.join(blobs.paths.stagingDir, 'old.part');
    const fresh = path.join(blobs.paths.stagingDir, 'fresh.part');
    writeFileSync(old, 'x');
    writeFileSync(fresh, 'x');
    const oldTime = new Date(blobs.now() - 3 * 24 * 3600_000);
    utimesSync(old, oldTime, oldTime);
    const queue = createJobQueue({ db: blobs.db, now: blobs.now });
    const handlers = createDefaultJobHandlers({ db: blobs.db, blobs: blobs.store, now: blobs.now });
    const ok = queue.enqueue({ kind: 'blobs.staging-sweep' }).id;
    const tooShort = queue.enqueue({ kind: 'blobs.staging-sweep', payload: { maxAgeMs: 1000 } }).id;
    runnerOf({ queue, handlers, pollMs: 20 }).start();
    await until(() => (blobs.db.prepare('SELECT state FROM jobs WHERE id = ?').get(tooShort) as { state: string }).state === 'failed');
    await until(() => (blobs.db.prepare('SELECT state FROM jobs WHERE id = ?').get(ok) as { state: string }).state === 'succeeded');
    const { existsSync } = await import('node:fs');
    expect(existsSync(old)).toBe(false);
    expect(existsSync(fresh)).toBe(true);
  });

  it('declares every kind of the production list but no worker handler without an implementation', async () => {
    const blobs = openBlobFixture();
    open.push(blobs);
    const handlers = createDefaultJobHandlers({ db: blobs.db, blobs: blobs.store });
    const { JOB_KINDS } = await import('./job-kinds.js');
    const { PRODUCTION_WORKER_JOB_HANDLERS } = await import('../workers/worker-job-handlers.js');
    expect(Object.keys(handlers).sort()).toEqual([...JOB_KINDS].sort());
    for (const [kind, handler] of Object.entries(handlers)) {
      if (handler.isolation === 'worker') expect(Object.keys(PRODUCTION_WORKER_JOB_HANDLERS), kind).toContain(kind);
    }
  });
});
