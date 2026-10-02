import { Signal } from '@angular/core';

export type WorkerJobStatus = 'running' | 'done' | 'error' | 'cancelled';

/**
 * The reusable, signal-based handle returned by `WorkerClientService.run`.
 * A tool component binds directly to these signals and never touches the
 * underlying `Worker` instance.
 */
export interface WorkerJob<TResult> {
  readonly status: Signal<WorkerJobStatus>;
  readonly progress: Signal<number | null>;
  readonly result: Signal<TResult | null>;
  readonly error: Signal<string | null>;
  /** Hard-terminates the underlying worker. No-op once the job is no longer running. */
  cancel(): void;
}
