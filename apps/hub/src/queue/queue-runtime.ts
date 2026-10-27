import { existsSync } from 'node:fs';
import type { HubQueueStatusResponse } from '@dude/contracts/hub';
import type { Db } from '@dude/sqlite-store';
import { createLocalBlobStore } from '../blobs/local-blob-store.js';
import type { HubPaths } from '../config/data-dir.js';
import { drainAuditOutbox } from '../savesphere-db/audit-outbox.js';
import { openSaveSphereDb } from '../savesphere-db/open.js';
import type { SaveSphereDb } from '../savesphere-db/open.js';
import type { AuditInput } from '../security/audit.js';
import { createWorkerPool } from '../workers/worker-pool.js';
import { createDiskGuard, createVolumeProbe } from '../uploads/disk-guard.js';
import { createUploadService } from '../uploads/upload-service.js';
import type { UploadService } from '../uploads/upload-service.js';
import { createDefaultJobHandlers } from './handlers.js';
import { createJobQueue } from './job-queue.js';
import { createQueueRunner } from './queue-runner.js';
import type { QueueRunner, QueueSchedule, RunnerJobRegistry } from './queue-runner.js';

/** How often the scheduled blob maintenance is queued. */
export const BLOB_VERIFY_INTERVAL_MS = 6 * 3600_000;
export const BLOB_STAGING_SWEEP_INTERVAL_MS = 24 * 3600_000;
export const UPLOADS_EXPIRE_INTERVAL_MS = 15 * 60_000;

export const DEFAULT_QUEUE_SCHEDULES: readonly QueueSchedule[] = [
  { kind: 'blobs.verify', intervalMs: BLOB_VERIFY_INTERVAL_MS, payload: { limit: 25 } },
  { kind: 'blobs.staging-sweep', intervalMs: BLOB_STAGING_SWEEP_INTERVAL_MS, payload: {} },
  { kind: 'uploads.expire', intervalMs: UPLOADS_EXPIRE_INTERVAL_MS, payload: {} },
];

export interface QueueRuntimeOptions {
  paths: HubPaths;
  /** Writes a drained outbox event into `dude.db`'s audit log. */
  hubDb: Db;
  auditWriter: (input: AuditInput) => void;
  /** Worker processes at once (default 2). */
  workerPoolSize?: number;
  log?: (event: string, detail: Record<string, unknown>) => void;
}

export interface QueueRuntime {
  /** The read model behind `GET /api/v1/queue`. */
  status(): HubQueueStatusResponse;
  /** The one open `savesphere.db` connection (the ingest token scaffold, Milestone 843, shares it); closed by `stop`. */
  readonly db: Db;
  /** The resumable upload service (Milestone 845) over the same `savesphere.db`, blob store and uploads directory; the upload routes and the `uploads.expire` job share it. */
  readonly uploads: UploadService;
  /** Starts the runner (recovers interrupted jobs first) and reports into the job registry. */
  start(registry: RunnerJobRegistry): Promise<void>;
  /** Stops the runner and its workers, then closes `savesphere.db`. */
  stop(): Promise<void>;
}

/**
 * The Hub's queue, assembled for `run` (32-SS1, Milestone 834). It exists only when `savesphere.db` already does: a Hub that never
 * provisioned SaveSphere gets no file, no runner and no worker process (provisioning is Milestone 835). A refused or unreadable
 * store yields undefined and never blocks start. The pool spawns a process only when a `worker` job runs, and none of today's
 * handlers is one.
 */
export function createQueueRuntime(options: QueueRuntimeOptions): QueueRuntime | undefined {
  if (!existsSync(options.paths.saveSphereDbPath)) return undefined;
  const opened = openSaveSphereDb(options.paths);
  if (opened.status !== 'ready') {
    options.log?.('queue.unavailable', { reason: opened.status });
    return undefined;
  }
  const store: SaveSphereDb = opened.store;
  const queue = createJobQueue({ db: store.db });
  const workers = createWorkerPool({ scratchRoot: options.paths.workersDir, ...(options.workerPoolSize === undefined ? {} : { size: options.workerPoolSize }) });
  const blobs = createLocalBlobStore(options.paths);
  const drainAudit = (): void => { try { drainAuditOutbox(store.db, options.hubDb, options.auditWriter); } catch { /* retried by the next drain */ } };
  const uploads = createUploadService({ db: store.db, paths: options.paths, blobs, guard: createDiskGuard({ probe: createVolumeProbe(options.paths.uploadsDir) }), drainAudit });
  const handlers = createDefaultJobHandlers({ db: store.db, blobs, drainAudit, uploads });
  let runner: QueueRunner | undefined;
  return {
    status: () => queue.status(),
    db: store.db,
    uploads,
    async start(registry) {
      await workers.start();
      runner = createQueueRunner({ queue, handlers, workers, registry, db: store.db, schedules: DEFAULT_QUEUE_SCHEDULES, ...(options.log ? { log: options.log } : {}) });
      runner.start();
    },
    async stop() {
      await runner?.stop();
      await workers.shutdown();
      store.close();
    },
  };
}
