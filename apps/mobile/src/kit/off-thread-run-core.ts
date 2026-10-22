import { isAbortError } from './abort-error';
import type { Scheduler } from './text-tool-controller';

/** Pure core of `useOffThreadRun`: no React, no worklets. The hook injects `runOffThread` as `execute`. */
export interface OffThreadRunState<TResult> {
  /** Latest successful result. Kept while the next run is in flight, cleared by an error or by a null payload. */
  readonly result: TResult | null;
  /** Message of the latest failed run (an aborted run is never an error). */
  readonly error: string | null;
  /** True from the moment a payload is supplied until its run settles (including the debounce wait). */
  readonly busy: boolean;
}
export const IDLE_RUN: OffThreadRunState<never> = { result: null, error: null, busy: false };
export const DEFAULT_RUN_DEBOUNCE_MS = 150;
export const DEFAULT_RUN_ERROR = 'The tool failed to process this input.';

export interface OffThreadRunOptions {
  readonly debounceMs?: number;
  /** Shown when a run rejects without a message. */
  readonly fallbackError?: string;
}
type StateUpdate<TResult> = OffThreadRunState<TResult> | ((previous: OffThreadRunState<TResult>) => OffThreadRunState<TResult>);

const timers: Scheduler = { set: (fn, ms) => setTimeout(fn, ms), clear: handle => clearTimeout(handle as ReturnType<typeof setTimeout>) };

export function offThreadErrorMessage(error: unknown, fallback: string = DEFAULT_RUN_ERROR): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/**
 * Schedules one debounced run and returns its canceller. Starting marks the state busy (keeping the previous result); the
 * canceller clears the timer and aborts the signal, so a queued run is never dispatched and a running one has its result dropped.
 * After cancelling, this run never touches the state again, even if its promise settles in the same tick.
 */
export function startOffThreadRun<TPayload, TResult>(
  payload: TPayload,
  execute: (payload: TPayload, signal: AbortSignal) => Promise<TResult>,
  setState: (update: StateUpdate<TResult>) => void,
  options: OffThreadRunOptions & { readonly scheduler?: Scheduler } = {},
): () => void {
  const { debounceMs = DEFAULT_RUN_DEBOUNCE_MS, fallbackError = DEFAULT_RUN_ERROR, scheduler = timers } = options;
  const controller = new AbortController();
  let cancelled = false;
  setState(previous => (previous.busy ? previous : { ...previous, busy: true }));
  const handle = scheduler.set(() => {
    let pending: Promise<TResult>;
    try { pending = execute(payload, controller.signal); } catch (error) { pending = Promise.reject(error); }
    pending.then(
      result => { if (!cancelled) setState({ result, error: null, busy: false }); },
      (error: unknown) => {
        if (cancelled || isAbortError(error)) return;
        setState({ result: null, error: offThreadErrorMessage(error, fallbackError), busy: false });
      },
    );
  }, debounceMs);
  return () => { cancelled = true; scheduler.clear(handle); controller.abort(); };
}
