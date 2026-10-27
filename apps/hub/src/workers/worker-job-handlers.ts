import type { WorkerJobImplementations } from './job-worker-host.js';

/**
 * The code a job worker process runs, keyed by job kind (32-SS1, Milestone 834). It is empty on purpose: every handler of this
 * milestone (`noop.echo`, `blobs.verify`, `blobs.staging-sweep`) is `inline` because it needs the Hub's own database or blob
 * store. A later SaveSphere phase registers its `worker` kinds here (text extraction, OCR, embedding, import parsing) next to a
 * `WorkerJobHandler` declaration for the same kind in the Hub's handler map; `worker-job-handlers.spec.ts` fails if a declared
 * worker kind has no implementation here. Code in this map runs without a database handle, Hub secrets or a network policy
 * beyond the operating system's, and receives file paths or a payload, never a connection.
 */
export const PRODUCTION_WORKER_JOB_HANDLERS: WorkerJobImplementations = {};
