import { spawn, spawnSync } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import type { JobResult } from '../queue/job-kinds.js';
import { redactJobError } from '../queue/redact.js';
import { WORKER_MAX_LINE_BYTES, parseWorkerOutMessage } from './job-protocol.js';
import type { WorkerRunMessage } from './job-protocol.js';
import { JOB_WORKER_KIND_NAME, internalWorkerArgs } from './worker-mode.js';
import type { InternalWorkerCommand } from './worker-mode.js';

export const DEFAULT_WORKER_POOL_SIZE = 2;
/** The worker kind (`--internal-worker job`) every pooled child runs. */
export const JOB_WORKER_KIND = JOB_WORKER_KIND_NAME;

export interface WorkerRunRequest {
  jobId: string;
  kind: string;
  payload: unknown;
  attempt: number;
  timeoutMs: number;
  /** `--max-old-space-size` for the child, in MiB. */
  memoryLimitMb: number;
}

export type WorkerFailureCode = 'timeout' | 'oom' | 'crashed' | 'handler-error' | 'protocol' | 'spawn-failed' | 'aborted' | 'shutdown';

/** A worker attempt that did not produce a result. `retryable` tells the queue whether another attempt can help. */
export class WorkerJobError extends Error {
  override readonly name = 'WorkerJobError';
  constructor(readonly code: WorkerFailureCode, message: string, readonly retryable: boolean) {
    super(message);
  }
}

export interface WorkerRunOptions {
  signal?: AbortSignal;
  onProgress?: (note: string, fraction?: number) => void;
}

/** What the queue runner needs from a pool; specs substitute their own. */
export interface WorkerRunner {
  run(request: WorkerRunRequest, options?: WorkerRunOptions): Promise<JobResult>;
  shutdown(): Promise<void>;
}

export interface WorkerPoolOptions {
  /** Concurrent worker processes (default 2). */
  size?: number;
  /** Parent directory of the per-job scratch directories (each job's working directory); removed after the job and swept on `start`. */
  scratchRoot: string;
  /** How a worker process is started; defaults to the Hub executable re-spawned in job-worker mode (`internalWorkerArgs`). */
  command?: () => InternalWorkerCommand;
  /** Extra environment for every worker, on top of the allowlist. Never pass a secret. */
  extraEnv?: Readonly<Record<string, string>>;
  /** Delay before the next spawn after consecutive crashes: base, doubling, capped. Reset by any clean result. */
  crashBackoff?: { baseMs: number; maxMs: number };
  /** How long a worker may take to exit after answering before it is killed. */
  exitGraceMs?: number;
}

/**
 * Environment variables a worker may inherit. Everything else (credentials, tokens, `NODE_OPTIONS`, `PATH`, proxy settings)
 * is dropped; the pool adds the scratch directory as the temp locations, the heap limit and a marker.
 */
export const WORKER_ENV_ALLOWLIST = ['SystemRoot', 'windir', 'TZ', 'LANG', 'LC_ALL'] as const;

export function buildWorkerEnv(options: { parentEnv: NodeJS.ProcessEnv; scratchDir: string; memoryLimitMb: number; extraEnv?: Readonly<Record<string, string>> }): Record<string, string> {
  const env: Record<string, string> = {};
  for (const name of WORKER_ENV_ALLOWLIST) {
    const value = options.parentEnv[name];
    if (value !== undefined) env[name] = value;
  }
  Object.assign(env, options.extraEnv ?? {});
  env['TEMP'] = options.scratchDir;
  env['TMP'] = options.scratchDir;
  env['TMPDIR'] = options.scratchDir;
  env['NODE_OPTIONS'] = `--max-old-space-size=${Math.max(16, Math.trunc(options.memoryLimitMb))}`;
  env['DUDE_INTERNAL_WORKER'] = '1';
  return env;
}

const OOM_SIGNATURE = /heap out of memory|Reached heap limit|ERR_WORKER_OUT_OF_MEMORY|Allocation failed/i;
const STDERR_TAIL_BYTES = 4096;

/** Kills a process and, on Windows, the processes it started (`taskkill /T`). */
function killTree(child: ChildProcess): void {
  if (child.pid !== undefined && process.platform === 'win32') {
    try { spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore', timeout: 5000 }); } catch { /* fall back to kill() */ }
  }
  try { child.kill('SIGKILL'); } catch { /* already gone */ }
}

const sleep = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve) => {
    if (ms <= 0 || signal?.aborted === true) { resolve(); return; }
    const timer = setTimeout(done, ms);
    function done(): void { clearTimeout(timer); signal?.removeEventListener('abort', done); resolve(); }
    signal?.addEventListener('abort', done, { once: true });
  });

export interface WorkerPool extends WorkerRunner {
  /** Removes scratch directories a previous Hub process left behind. Call once before the first run. */
  start(): Promise<void>;
  /** Process ids of the workers alive right now (diagnostics and specs). */
  activePids(): number[];
}

/**
 * The isolated worker host (32-SS1, PD-147). Each job runs in its own child process: the Hub executable re-spawned as
 * `--internal-worker job` (`sea.isSea()` picks the executable or `node <bundle>`), with an allowlisted environment, a per-job
 * scratch directory as its working directory and `--max-old-space-size` for its heap. A wall-clock timeout kills it (and on
 * Windows its process tree); a crash, an out-of-memory abort or a protocol error fails only that attempt, and consecutive
 * crashes slow the next spawn down. The child exits when its stdin closes, so closing the pool, or the Hub dying, leaves no
 * worker behind. At most `size` children exist at once; further requests wait.
 *
 * Limits, recorded rather than hidden: the heap ceiling bounds V8 memory only (a native allocation can exceed it, and the
 * timeout is the bound there); Windows Job Objects are not reachable from Node, so a Hub killed without running its shutdown
 * relies on stdin closing, which an event loop blocked inside a worker cannot observe until it yields.
 */
export function createWorkerPool(options: WorkerPoolOptions): WorkerPool {
  const size = Math.max(1, Math.trunc(options.size ?? DEFAULT_WORKER_POOL_SIZE));
  const backoff = options.crashBackoff ?? { baseMs: 1000, maxMs: 30_000 };
  const exitGraceMs = options.exitGraceMs ?? 2000;
  const command = options.command ?? ((): InternalWorkerCommand => internalWorkerArgs(JOB_WORKER_KIND));
  const children = new Set<ChildProcess>();
  const waiters: Array<() => void> = [];
  let free = size;
  let closed = false;
  let crashes = 0;
  let nextSpawnAt = 0;
  const shutdownController = new AbortController();

  const acquire = async (signal: AbortSignal | undefined): Promise<void> => {
    if (free > 0) { free -= 1; return; }
    await new Promise<void>((resolve, reject) => {
      const fail = (): void => {
        const index = waiters.indexOf(grant);
        if (index >= 0) waiters.splice(index, 1);
        reject(new WorkerJobError(closed ? 'shutdown' : 'aborted', closed ? 'The worker pool is shutting down.' : 'The job was cancelled before a worker was free.', closed));
      };
      const grant = (): void => { signal?.removeEventListener('abort', fail); shutdownController.signal.removeEventListener('abort', fail); resolve(); };
      waiters.push(grant);
      signal?.addEventListener('abort', fail, { once: true });
      shutdownController.signal.addEventListener('abort', fail, { once: true });
    });
  };
  const release = (): void => {
    const next = waiters.shift();
    if (next) next(); else free += 1;
  };

  const noteCrash = (): void => {
    crashes += 1;
    nextSpawnAt = Date.now() + Math.min(backoff.maxMs, backoff.baseMs * 2 ** Math.min(20, crashes - 1));
  };
  const noteClean = (): void => { crashes = 0; nextSpawnAt = 0; };

  async function runChild(request: WorkerRunRequest, runOptions: WorkerRunOptions): Promise<JobResult> {
    const scratch = path.join(options.scratchRoot, `${request.jobId.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 40)}-${randomBytes(4).toString('hex')}`);
    await mkdir(scratch, { recursive: true });
    try {
      return await new Promise<JobResult>((resolve, reject) => {
        let child: ChildProcess;
        try {
          const { command: exe, args } = command();
          child = spawn(exe, args, {
            cwd: scratch,
            env: buildWorkerEnv({ parentEnv: process.env, scratchDir: scratch, memoryLimitMb: request.memoryLimitMb, ...(options.extraEnv ? { extraEnv: options.extraEnv } : {}) }),
            stdio: ['pipe', 'pipe', 'pipe'],
            windowsHide: true,
          });
        } catch {
          reject(new WorkerJobError('spawn-failed', 'The worker process could not be started.', true));
          return;
        }
        children.add(child);
        let killedFor: 'timeout' | 'aborted' | 'shutdown' | 'protocol' | undefined;
        let outcome: { ok: true; result: JobResult } | { ok: false; error: string; retryable: boolean } | undefined;
        let stdoutBuffer = '';
        let stderrTail = '';
        let spawnError: Error | undefined;
        let exitTimer: NodeJS.Timeout | undefined;

        const kill = (why: 'timeout' | 'aborted' | 'shutdown' | 'protocol'): void => {
          if (killedFor !== undefined) return;
          killedFor = why;
          killTree(child);
        };
        const timer = setTimeout(() => kill('timeout'), Math.max(1, request.timeoutMs));
        const onAbort = (): void => kill(closed ? 'shutdown' : 'aborted');
        runOptions.signal?.addEventListener('abort', onAbort, { once: true });
        shutdownController.signal.addEventListener('abort', onAbort, { once: true });
        if (runOptions.signal?.aborted === true) onAbort();

        child.stdout?.setEncoding('utf8');
        child.stderr?.setEncoding('utf8');
        child.stdout?.on('data', (chunk: string) => {
          stdoutBuffer += chunk;
          for (let newline = stdoutBuffer.indexOf('\n'); newline >= 0; newline = stdoutBuffer.indexOf('\n')) {
            const line = stdoutBuffer.slice(0, newline);
            stdoutBuffer = stdoutBuffer.slice(newline + 1);
            const message = parseWorkerOutMessage(line);
            if (message === undefined || message.id !== request.jobId) { kill('protocol'); return; }
            if (message.type === 'progress') {
              try { runOptions.onProgress?.(message.note, message.fraction); } catch { /* a progress sink never fails a job */ }
            } else if (outcome === undefined) {
              outcome = message.ok ? { ok: true, result: message.result } : { ok: false, error: message.error, retryable: message.retryable };
              // The worker exits by itself after answering; closing its stdin tells it there is nothing more to wait for.
              child.stdin?.end();
              exitTimer = setTimeout(() => killTree(child), exitGraceMs);
            }
          }
          if (stdoutBuffer.length > WORKER_MAX_LINE_BYTES) kill('protocol');
        });
        child.stderr?.on('data', (chunk: string) => { stderrTail = (stderrTail + chunk).slice(-STDERR_TAIL_BYTES); });
        child.on('error', (error) => { spawnError = error; });
        child.stdin?.on('error', () => undefined);
        child.on('close', (code, signal) => {
          clearTimeout(timer);
          if (exitTimer) clearTimeout(exitTimer);
          runOptions.signal?.removeEventListener('abort', onAbort);
          shutdownController.signal.removeEventListener('abort', onAbort);
          children.delete(child);
          if (outcome?.ok === true) { noteClean(); resolve(outcome.result); return; }
          if (outcome?.ok === false) { noteClean(); reject(new WorkerJobError('handler-error', redactJobError(outcome.error), outcome.retryable)); return; }
          if (killedFor === 'timeout') { reject(new WorkerJobError('timeout', `The worker did not finish within ${request.timeoutMs} ms and was stopped.`, true)); return; }
          if (killedFor === 'aborted') { reject(new WorkerJobError('aborted', 'The job was cancelled and its worker stopped.', true)); return; }
          if (killedFor === 'shutdown') { reject(new WorkerJobError('shutdown', 'The Hub is shutting down.', true)); return; }
          if (killedFor === 'protocol') { reject(new WorkerJobError('protocol', 'The worker sent an invalid message and was stopped.', true)); return; }
          if (spawnError !== undefined) { noteCrash(); reject(new WorkerJobError('spawn-failed', 'The worker process could not be started.', true)); return; }
          noteCrash();
          if (OOM_SIGNATURE.test(stderrTail)) {
            reject(new WorkerJobError('oom', `The worker exceeded its ${request.memoryLimitMb} MiB memory limit.`, false));
            return;
          }
          reject(new WorkerJobError('crashed', `The worker exited unexpectedly (${signal ?? `code ${code ?? 'unknown'}`}).`, true));
        });

        const run: WorkerRunMessage = { type: 'run', id: request.jobId, kind: request.kind, payload: request.payload, attempt: request.attempt };
        child.stdin?.write(`${JSON.stringify(run)}\n`);
      });
    } finally {
      void rm(scratch, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  return {
    async start() {
      await rm(options.scratchRoot, { recursive: true, force: true }).catch(() => undefined);
      await mkdir(options.scratchRoot, { recursive: true });
    },

    async run(request, runOptions = {}) {
      if (closed) throw new WorkerJobError('shutdown', 'The worker pool is shutting down.', true);
      await acquire(runOptions.signal);
      try {
        const wait = nextSpawnAt - Date.now();
        if (wait > 0) await sleep(wait, runOptions.signal);
        if (closed) throw new WorkerJobError('shutdown', 'The worker pool is shutting down.', true);
        if (runOptions.signal?.aborted === true) throw new WorkerJobError('aborted', 'The job was cancelled before a worker started.', true);
        return await runChild(request, runOptions);
      } finally {
        release();
      }
    },

    activePids() {
      return [...children].flatMap((child) => (child.pid === undefined ? [] : [child.pid]));
    },

    async shutdown() {
      closed = true;
      shutdownController.abort();
      for (const child of children) killTree(child);
      const deadline = Date.now() + 5000;
      while (children.size > 0 && Date.now() < deadline) await sleep(25);
    },
  };
}
