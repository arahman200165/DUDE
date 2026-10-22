import { createWorkletRuntime, scheduleOnRN, scheduleOnRuntime, type WorkletRuntime } from 'react-native-worklets';
import { installWorkerHost } from '../engine-host/worker-host';
import { abortError, isAbortError } from './abort-error';

export { isAbortError };

/**
 * Heavy tool engines run here, off the React Native JS thread, on one dedicated react-native-worklets worker runtime.
 * Setup: react-native-worklets Bundle Mode (babel.config.cjs bundleMode + importForwarding, metro.config.cjs
 * getBundleModeMetroConfig). A task body is a worklet: its module imports (@dude/tool-engine, @dude/crypto, npm packages
 * listed in importForwarding.moduleNames) are re-imported from the bundle on the worker, so the real engine functions run there.
 *
 * Tasks are defined only in src/tools/** (src/kit must not import tool engines):
 *   const formatJsonTask = defineOffThreadTask((input: { text: string; indent: number }) => { 'worklet'; return formatJson(input.text, input.indent); });
 *   const result = await runOffThread(formatJsonTask, { text, indent: 2 }, { signal });
 *
 * Payloads and results cross the runtime boundary as JSON text only (plain JSON values; no functions, Maps or class instances).
 * Jobs run one at a time in submission order; a job aborted before it starts is never dispatched, and an aborted running job
 * rejects with an AbortError immediately and its result is dropped. There is deliberately no main-thread fallback.
 */
export type OffThreadTask<TPayload, TResult> = ((payload: TPayload) => TResult | Promise<TResult>) & { readonly __offThread?: never };

export interface OffThreadOptions { readonly signal?: AbortSignal }

export class OffThreadUnavailableError extends Error {
  constructor(detail: string) { super(`Off-thread execution is unavailable: ${detail}`); this.name = 'OffThreadUnavailableError'; }
}


/**
 * Marks a worklet function as an off-thread task. `fn` must start with the 'worklet' directive; the Worklets Babel plugin
 * (bundle mode) turns it into a serializable worklet whose imports are forwarded to the worker runtime.
 */
export function defineOffThreadTask<TPayload, TResult>(fn: (payload: TPayload) => TResult | Promise<TResult>): OffThreadTask<TPayload, TResult> {
  return fn as OffThreadTask<TPayload, TResult>;
}

const RUNTIME_NAME = 'dude-tools';
type Settle = (ok: boolean, value: string) => void;
type WorkerGlobals = { __dudeWorkerInitError?: string };

let runtime: WorkletRuntime | undefined;
let runtimeError: string | undefined;

function ensureRuntime(): WorkletRuntime {
  if (runtime) return runtime;
  if (runtimeError) throw new OffThreadUnavailableError(runtimeError);
  try {
    runtime = createWorkletRuntime({
      name: RUNTIME_NAME,
      initializer: () => {
        'worklet';
        try { installWorkerHost(); } catch (error) { (globalThis as WorkerGlobals).__dudeWorkerInitError = error instanceof Error ? error.message : String(error); }
      },
    });
    return runtime;
  } catch (error) {
    runtimeError = error instanceof Error ? error.message : String(error);
    throw new OffThreadUnavailableError(runtimeError);
  }
}

/** True when a worklet worker runtime can be created (native Worklets present and bundle mode usable). */
export function isOffThreadAvailable(): boolean {
  try { ensureRuntime(); return true; } catch { return false; }
}

/** Runs on the worker runtime. Everything it touches is a closure value, a forwarded import or a worker global. */
function runJob(task: (payload: unknown) => unknown, payloadJson: string, settle: Settle): void {
  'worklet';
  const fail = (error: unknown) => {
    const err = error as { name?: unknown; message?: unknown } | null;
    scheduleOnRN(settle, false, JSON.stringify({ name: typeof err?.name === 'string' ? err.name : 'Error', message: typeof err?.message === 'string' ? err.message : String(error) }));
  };
  try {
    const initError = (globalThis as WorkerGlobals).__dudeWorkerInitError;
    if (initError) throw new Error(`Worker host failed to install: ${initError}`);
    const result = task(JSON.parse(payloadJson));
    if (result && typeof (result as Promise<unknown>).then === 'function') {
      (result as Promise<unknown>).then(value => scheduleOnRN(settle, true, JSON.stringify(value) ?? 'null'), fail);
    } else {
      scheduleOnRN(settle, true, JSON.stringify(result) ?? 'null');
    }
  } catch (error) { fail(error); }
}

interface Job { readonly task: (payload: unknown) => unknown; readonly payloadJson: string; readonly resolve: (value: unknown) => void; readonly reject: (error: Error) => void; started: boolean; done: boolean; cleanup?: () => void }
const queue: Job[] = [];
let running = false;

function finish(job: Job, outcome: () => void): void {
  if (job.done) return;
  job.done = true;
  job.cleanup?.();
  outcome();
}

function pump(): void {
  if (running) return;
  const job = queue.shift();
  if (!job) return;
  if (job.done) { pump(); return; }
  running = true;
  job.started = true;
  const settle: Settle = (ok, value) => {
    running = false;
    // A stale (aborted) job already rejected; its late result is dropped here.
    finish(job, () => {
      if (ok) { try { job.resolve(JSON.parse(value)); } catch (error) { job.reject(error instanceof Error ? error : new Error(String(error))); } return; }
      let name = 'Error';
      let message = value;
      try { const parsed = JSON.parse(value) as { name?: string; message?: string }; name = parsed.name ?? name; message = parsed.message ?? message; } catch { /* keep the raw text */ }
      const error = new Error(message);
      error.name = name;
      job.reject(error);
    });
    pump();
  };
  try {
    scheduleOnRuntime(ensureRuntime(), runJob, job.task, job.payloadJson, settle);
  } catch (error) {
    running = false;
    finish(job, () => job.reject(error instanceof Error ? error : new Error(String(error))));
    pump();
  }
}

/** Runs `task` with `payload` on the 'dude-tools' worker runtime and resolves with its JSON-roundtripped result. */
export function runOffThread<TPayload, TResult>(task: OffThreadTask<TPayload, TResult>, payload: TPayload, options: OffThreadOptions = {}): Promise<TResult> {
  const { signal } = options;
  if (signal?.aborted) return Promise.reject(abortError());
  let payloadJson: string;
  try { payloadJson = JSON.stringify(payload) ?? 'null'; } catch (error) { return Promise.reject(error instanceof Error ? error : new Error(String(error))); }
  return new Promise<TResult>((resolve, reject) => {
    const job: Job = { task: task as (payload: unknown) => unknown, payloadJson, resolve: resolve as (value: unknown) => void, reject, started: false, done: false };
    if (signal) {
      const onAbort = (): void => {
        // Queued jobs are never dispatched; a running job keeps going on the worker but its result is dropped.
        const wasQueued = !job.started;
        finish(job, () => reject(abortError()));
        if (wasQueued) { const index = queue.indexOf(job); if (index >= 0) queue.splice(index, 1); }
      };
      signal.addEventListener('abort', onAbort, { once: true });
      job.cleanup = () => signal.removeEventListener('abort', onAbort);
    }
    queue.push(job);
    pump();
  });
}

/** Test hook: forget the runtime and pending jobs. */
export function resetOffThreadForTests(): void { runtime = undefined; runtimeError = undefined; queue.length = 0; running = false; }
