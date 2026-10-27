import { existsSync, mkdtempSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WORKER_ENV_ALLOWLIST, WorkerJobError, buildWorkerEnv, createWorkerPool } from './worker-pool.js';
import type { WorkerPool, WorkerRunRequest } from './worker-pool.js';
import { buildTestWorkerBundle, testWorkerCommand } from './test-worker-bundle.js';
import { internalWorkerArgs } from './worker-mode.js';

let bundle = '';
const pools: WorkerPool[] = [];
const scratchRoot = (): string => path.join(mkdtempSync(path.join(os.tmpdir(), 'ss-pool-')), 'workers');

beforeAll(async () => { bundle = await buildTestWorkerBundle(); }, 60_000);
afterAll(async () => { for (const pool of pools) await pool.shutdown(); });

const poolOf = async (extra: Partial<Parameters<typeof createWorkerPool>[0]> = {}): Promise<WorkerPool> => {
  const pool = createWorkerPool({ scratchRoot: scratchRoot(), command: testWorkerCommand(bundle), crashBackoff: { baseMs: 1, maxMs: 5 }, ...extra });
  await pool.start();
  pools.push(pool);
  return pool;
};
const request = (kind: string, payload: unknown = {}, extra: Partial<WorkerRunRequest> = {}): WorkerRunRequest => ({
  jobId: `job-${kind.replace(/\W/g, '')}`, kind, payload, attempt: 1, timeoutMs: 15_000, memoryLimitMb: 256, ...extra,
});
const alive = (pid: number): boolean => { try { process.kill(pid, 0); return true; } catch { return false; } };
const until = async (check: () => boolean, ms = 5000): Promise<void> => {
  const end = Date.now() + ms;
  while (!check() && Date.now() < end) await new Promise((resolve) => setTimeout(resolve, 20));
};
const failure = async (promise: Promise<unknown>): Promise<WorkerJobError> => {
  try { await promise; } catch (error) { return error as WorkerJobError; }
  throw new Error('expected the run to fail');
};

describe('buildWorkerEnv', () => {
  it('keeps only the allowlist, points temp at the scratch directory and sets the heap ceiling', () => {
    const env = buildWorkerEnv({
      parentEnv: { PATH: '/bin', SystemRoot: 'C:\\Windows', DUDE_SECRET: 's', TUNNEL_TOKEN: 't', NODE_OPTIONS: '--inspect', LANG: 'en' },
      scratchDir: '/scratch/j1', memoryLimitMb: 128,
    });
    expect(env).toEqual({ SystemRoot: 'C:\\Windows', LANG: 'en', TEMP: '/scratch/j1', TMP: '/scratch/j1', TMPDIR: '/scratch/j1', NODE_OPTIONS: '--max-old-space-size=128', DUDE_INTERNAL_WORKER: '1' });
    expect([...WORKER_ENV_ALLOWLIST]).not.toContain('PATH');
  });
});

describe('worker pool', () => {
  it('runs a job in a child process and returns its result with progress', async () => {
    const pool = await poolOf();
    const progress: Array<[string, number | undefined]> = [];
    const result = await pool.run(request('test.echo', { a: 1 }), { onProgress: (note, fraction) => progress.push([note, fraction]) });
    expect(result).toEqual({ summary: 'Echoed.', data: { echo: { a: 1 } } });
    expect(progress).toEqual([['halfway', 0.5]]);
    expect(pool.activePids()).toEqual([]);
  });

  it('reports a handler error as retryable and a permanent one as not retryable', async () => {
    const pool = await poolOf();
    const failed = await failure(pool.run(request('test.fail', { message: 'boom' })));
    expect(failed).toMatchObject({ code: 'handler-error', retryable: true, message: 'boom' });
    const permanent = await failure(pool.run(request('test.permanent')));
    expect(permanent).toMatchObject({ code: 'handler-error', retryable: false });
    const unknown = await failure(pool.run(request('test.nope')));
    expect(unknown.retryable).toBe(false);
  });

  it('kills a worker at its timeout', async () => {
    const pool = await poolOf();
    const started = Date.now();
    const error = await failure(pool.run(request('test.sleep', { ms: 60_000 }, { timeoutMs: 400 })));
    expect(error).toMatchObject({ code: 'timeout', retryable: true });
    expect(Date.now() - started).toBeLessThan(10_000);
    expect(pool.activePids()).toEqual([]);
  });

  it('turns a worker crash into a retryable failure of that attempt only, and the next job still runs', async () => {
    const pool = await poolOf();
    const error = await failure(pool.run(request('test.crash')));
    expect(error).toMatchObject({ code: 'crashed', retryable: true });
    expect(await pool.run(request('test.echo'))).toMatchObject({ summary: 'Echoed.' });
  });

  it('kills a worker that exceeds its memory limit and does not retry it', async () => {
    const pool = await poolOf();
    const error = await failure(pool.run(request('test.oom', {}, { memoryLimitMb: 48, timeoutMs: 60_000 })));
    expect(error).toMatchObject({ code: 'oom', retryable: false });
    expect(error.message).toContain('48 MiB');
  }, 90_000);

  it('gives the worker no secret from the Hub environment, a scratch working directory and a heap ceiling', async () => {
    process.env['DUDE_TEST_HUB_SECRET'] = 'super-secret-value';
    process.env['TUNNEL_TOKEN'] = 'tunnel-secret';
    try {
      const root = scratchRoot();
      const pool = await poolOf({ scratchRoot: root });
      const result = await pool.run(request('test.env', {}, { memoryLimitMb: 200 }));
      const data = result.data as { envNames: string[]; cwd: string; temp: string; nodeOptions: string };
      expect(data.envNames).not.toContain('DUDE_TEST_HUB_SECRET');
      expect(data.envNames).not.toContain('TUNNEL_TOKEN');
      // Windows adds its own baseline (USERPROFILE, PATH from the system, ...) to any child; nothing of the Hub's own reaches it.
      expect(data.envNames).toContain('DUDE_INTERNAL_WORKER');
      expect(data.envNames.filter((name) => /secret|token|key|pass|dude_test/i.test(name))).toEqual([]);
      expect(data.nodeOptions).toBe('--max-old-space-size=200');
      expect(path.dirname(path.resolve(data.cwd))).toBe(path.resolve(root));
      expect(data.temp).toBe(data.cwd);
    } finally {
      delete process.env['DUDE_TEST_HUB_SECRET'];
      delete process.env['TUNNEL_TOKEN'];
    }
  });

  it('removes the per-job scratch directory after the job and empties leftovers when the pool starts', async () => {
    const root = scratchRoot();
    const pool = await poolOf({ scratchRoot: root });
    const result = await pool.run(request('test.scratch'));
    const cwd = (result.data as { cwd: string }).cwd;
    await until(() => !existsSync(cwd));
    expect(existsSync(cwd)).toBe(false);
    expect(readdirSync(root)).toEqual([]);
    const leftover = path.join(root, 'old-job');
    (await import('node:fs')).mkdirSync(leftover);
    await pool.start();
    expect(existsSync(leftover)).toBe(false);
  });

  it('runs at most `size` workers at once and queues the rest', async () => {
    const pool = await poolOf({ size: 1 });
    const slow = pool.run(request('test.sleep', { ms: 500 }, { jobId: 'a' }));
    const second = pool.run(request('test.echo', {}, { jobId: 'b' }));
    await until(() => pool.activePids().length === 1);
    expect(pool.activePids()).toHaveLength(1);
    const [, echoed] = await Promise.all([slow, second]);
    expect(echoed.summary).toBe('Echoed.');
  });

  it('delays the next spawn after consecutive crashes', async () => {
    const pool = await poolOf({ crashBackoff: { baseMs: 400, maxMs: 400 } });
    await failure(pool.run(request('test.crash')));
    const started = Date.now();
    await pool.run(request('test.echo'));
    expect(Date.now() - started).toBeGreaterThanOrEqual(350);
    const again = Date.now();
    await pool.run(request('test.echo'));
    expect(Date.now() - again).toBeLessThan(350);
  });

  it('stops a running job when its signal aborts', async () => {
    const pool = await poolOf();
    const controller = new AbortController();
    const running = pool.run(request('test.sleep', { ms: 60_000 }), { signal: controller.signal });
    await until(() => pool.activePids().length === 1);
    controller.abort();
    expect(await failure(running)).toMatchObject({ code: 'aborted' });
    expect(pool.activePids()).toEqual([]);
  });

  it('leaves no orphan process after shutdown, and refuses new work', async () => {
    const pool = await poolOf({ size: 2 });
    const a = failure(pool.run(request('test.sleep', { ms: 60_000 }, { jobId: 'a' })));
    const b = failure(pool.run(request('test.sleep', { ms: 60_000 }, { jobId: 'b' })));
    await until(() => pool.activePids().length === 2);
    const pids = pool.activePids();
    expect(pids).toHaveLength(2);
    await pool.shutdown();
    expect(await a).toMatchObject({ code: 'shutdown' });
    expect(await b).toMatchObject({ code: 'shutdown' });
    await until(() => pids.every((pid) => !alive(pid)));
    expect(pids.map(alive)).toEqual([false, false]);
    expect(await failure(pool.run(request('test.echo')))).toMatchObject({ code: 'shutdown' });
  });
});

describe('a worker outlives nothing', () => {
  it('exits by itself when its stdin closes (the Hub is gone)', async () => {
    const { command, args } = internalWorkerArgs('job', { sea: false, scriptPath: bundle });
    const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    const exited = new Promise<number | null>((resolve) => child.on('close', (code) => resolve(code)));
    child.stdin.write(`${JSON.stringify({ type: 'run', id: 'x', kind: 'test.sleep', payload: { ms: 60_000 }, attempt: 1 })}\n`);
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(alive(child.pid!)).toBe(true);
    child.stdin.end();
    expect(await Promise.race([exited, new Promise<string>((resolve) => setTimeout(() => resolve('still running'), 8000))])).toBe(3);
  });

  it('exits non-zero for a malformed request and for a kind it does not run', async () => {
    const run = async (line: string): Promise<{ code: number | null; out: string }> => {
      const { command, args } = internalWorkerArgs('job', { sea: false, scriptPath: bundle });
      const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true });
      let out = '';
      child.stdout.on('data', (chunk: Buffer) => { out += chunk.toString('utf8'); });
      const exited = new Promise<number | null>((resolve) => child.on('close', (code) => resolve(code)));
      child.stdin.write(`${line}\n`);
      return { code: await exited, out };
    };
    expect((await run('not json')).code).toBe(2);
    const unknown = await run(JSON.stringify({ type: 'run', id: 'x', kind: 'nope', payload: {}, attempt: 1 }));
    expect(unknown.code).toBe(2);
    expect(JSON.parse(unknown.out.trim())).toMatchObject({ type: 'result', ok: false, retryable: false });
  });
});
