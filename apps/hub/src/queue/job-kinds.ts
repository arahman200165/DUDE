import type { HubJobId } from '@dude/contracts/hub';

/**
 * The closed list of job kinds the durable queue accepts (32-SS1, PD-147). This is the extension point: a later SaveSphere phase
 * adds its kind here (`extract.*`, `ocr.*`, `embed.*`, `import.*`, `mirror.*`, `backup.*`) together with a handler declaration in
 * the map it registers (`createDefaultJobHandlers` for Hub-process work; `workers/worker-job-handlers.ts` for the code a worker
 * process runs). A kind with no handler fails permanently at claim time instead of looping, and `enqueue` refuses an unknown kind.
 * The queue runs Hub-internal work only: no route enqueues, and nothing here dispatches to a device.
 */
export const JOB_KINDS = ['noop.echo', 'blobs.verify', 'blobs.staging-sweep', 'uploads.expire'] as const;
export type JobKind = (typeof JOB_KINDS)[number];

export type JobIsolation = 'inline' | 'worker';

/** What a handler returns: one short sentence for the job-status view and optional small structured data (stored, at most 16 KiB). */
export interface JobResult {
  summary: string;
  data?: Record<string, unknown>;
  /** The job ran but found something the owner should see (for example a corrupt blob): the job-status view shows it as failed. */
  attention?: boolean;
}

/** What a handler sees. `signal` aborts on timeout, lost lease or shutdown; a handler that can wait should stop when it fires. */
export interface JobContext {
  job: { id: string; kind: string; payload: unknown; attempt: number };
  signal: AbortSignal;
  progress(note: string): void;
}

interface JobHandlerBase {
  /** Wall-clock limit for one attempt. A worker is killed at it; an inline handler is only signalled (keep inline work short). */
  timeoutMs: number;
  /** Overrides the default attempt count for this kind. */
  maxAttempts?: number;
  /** The `HUB_JOB_IDS` entry whose status the runner updates around each attempt of this kind. */
  hubJobId?: HubJobId;
}

/** Runs in the Hub process with the Hub's own handles (database, blob store). For short, trusted, I/O-bound work only. */
export interface InlineJobHandler extends JobHandlerBase {
  isolation: 'inline';
  run(context: JobContext): Promise<JobResult>;
}

/**
 * Runs in a child process (`workers/worker-pool.ts`): no database handle, an allowlisted environment, a scratch working directory
 * and a heap ceiling. The implementation lives in `workers/worker-job-handlers.ts`, keyed by the same kind.
 */
export interface WorkerJobHandler extends JobHandlerBase {
  isolation: 'worker';
  /** `--max-old-space-size` for the child, in MiB. */
  memoryLimitMb: number;
}

export type JobHandler = InlineJobHandler | WorkerJobHandler;
export type JobHandlers = Readonly<Record<string, JobHandler>>;
