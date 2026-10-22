import { useEffect, useState } from 'react';
import { IDLE_RUN, startOffThreadRun, type OffThreadRunOptions, type OffThreadRunState } from './off-thread-run-core';
import { runOffThread, type OffThreadTask } from './off-thread';

export type OffThreadRun<TResult> = OffThreadRunState<TResult>;
export type { OffThreadRunOptions };

/**
 * Debounced, cancellable off-thread run for tool screens. Pass a task defined in the tool folder (the kit never imports engines)
 * and a payload, or `null` for "nothing to run" (resets to idle). A new payload aborts the previous run (never dispatched if
 * still queued, result dropped if running) and keeps the last result visible until the new one settles.
 * The payload is compared by identity: memoize it (`useMemo`) so unrelated renders do not restart the run.
 */
export function useOffThreadRun<TPayload, TResult>(
  task: OffThreadTask<TPayload, TResult>,
  payload: TPayload | null,
  options: OffThreadRunOptions = {},
): OffThreadRun<TResult> {
  const { debounceMs, fallbackError } = options;
  const [state, setState] = useState<OffThreadRunState<TResult>>(IDLE_RUN);
  useEffect(() => {
    if (payload === null) { setState(IDLE_RUN); return undefined; }
    return startOffThreadRun(payload, (value, signal) => runOffThread(task, value, { signal }), setState, { debounceMs, fallbackError });
  }, [task, payload, debounceMs, fallbackError]);
  return payload === null ? IDLE_RUN : state;
}
