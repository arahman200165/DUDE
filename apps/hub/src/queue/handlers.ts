import type { Db } from '@dude/sqlite-store';
import { verifyBlobBatch } from '../blobs/verify.js';
import type { LocalBlobStore } from '../blobs/local-blob-store.js';
import { PermanentJobError } from './job-error.js';
import type { JobHandlers } from './job-kinds.js';
import type { UploadService } from '../uploads/upload-service.js';

export interface DefaultJobHandlerDeps {
  /** The `savesphere.db` connection (the blob catalogue). */
  db: Db;
  blobs: LocalBlobStore;
  now?: () => number;
  /** Drains audit outbox rows a blob job wrote into `dude.db` (called after a run that wrote some). */
  drainAudit?: () => void;
  /** The resumable upload service (Milestone 845); without it `uploads.expire` is a no-op that reports nothing to expire. */
  uploads?: UploadService;
}

const HOUR_MS = 3600_000;
export const DEFAULT_STAGING_MAX_AGE_MS = 24 * HOUR_MS;
const MIN_STAGING_MAX_AGE_MS = HOUR_MS;

function payloadObject(payload: unknown): Record<string, unknown> {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) throw new PermanentJobError('The job payload must be an object.');
  return payload as Record<string, unknown>;
}

const optionalInt = (value: unknown, name: string): number | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) throw new PermanentJobError(`The job payload field "${name}" must be a positive integer.`);
  return value;
};

/**
 * The handlers the Hub registers today (32-SS1, Milestone 834): `noop.echo` (tests and the queue's own health check),
 * `blobs.verify` (re-hash a batch of blobs through `verifyBlobBatch`) and `blobs.staging-sweep` (remove abandoned `.part` files).
 * All three are `inline`: they need the Hub's database and blob store and do bounded work. Later phases add their kinds to
 * `JOB_KINDS` and extend this map (or register `worker` handlers whose code lives in `workers/worker-job-handlers.ts`).
 */
export function createDefaultJobHandlers(deps: DefaultJobHandlerDeps): JobHandlers {
  const now = deps.now ?? Date.now;
  return {
    'noop.echo': {
      isolation: 'inline',
      timeoutMs: 5_000,
      maxAttempts: 2,
      run: async ({ job }) => ({ summary: 'Echoed the payload.', data: { echo: job.payload as Record<string, unknown> } }),
    },
    'blobs.verify': {
      isolation: 'inline',
      timeoutMs: 10 * 60_000,
      hubJobId: 'blobs-verify',
      run: async ({ job }) => {
        const limit = optionalInt(payloadObject(job.payload)['limit'], 'limit');
        const result = await verifyBlobBatch({ db: deps.db, store: deps.blobs, now, ...(limit === undefined ? {} : { limit }), ...(deps.drainAudit ? { afterCommit: deps.drainAudit } : {}) });
        const problems = result.corrupt.length + result.missing.length;
        return {
          summary: problems === 0
            ? `Checked ${result.checked} attachment${result.checked === 1 ? '' : 's'}; all intact.`
            : `Checked ${result.checked}; ${result.corrupt.length} corrupt, ${result.missing.length} missing.`,
          data: { checked: result.checked, ok: result.ok, corrupt: result.corrupt.length, missing: result.missing.length },
          attention: problems > 0,
        };
      },
    },
    'blobs.staging-sweep': {
      isolation: 'inline',
      timeoutMs: 2 * 60_000,
      hubJobId: 'blobs-staging-sweep',
      run: async ({ job }) => {
        const maxAgeMs = optionalInt(payloadObject(job.payload)['maxAgeMs'], 'maxAgeMs') ?? DEFAULT_STAGING_MAX_AGE_MS;
        if (maxAgeMs < MIN_STAGING_MAX_AGE_MS) throw new PermanentJobError('The staging sweep keeps files for at least one hour.');
        const removed = await deps.blobs.sweepStaging(maxAgeMs, now());
        return { summary: removed === 0 ? 'No abandoned upload files.' : `Removed ${removed} abandoned upload file${removed === 1 ? '' : 's'}.`, data: { removed } };
      },
    },
    'uploads.expire': {
      isolation: 'inline',
      timeoutMs: 5 * 60_000,
      hubJobId: 'uploads-expire',
      run: async () => {
        if (deps.uploads === undefined) return { summary: 'No uploads to expire.', data: { expired: 0, releasedRefs: 0, removedDirs: 0, pruned: 0 } };
        const result = await deps.uploads.expire();
        const summary = result.expired + result.releasedRefs + result.removedDirs === 0
          ? 'No expired uploads.'
          : `Expired ${result.expired} upload${result.expired === 1 ? '' : 's'}, released ${result.releasedRefs} blob reference${result.releasedRefs === 1 ? '' : 's'}, removed ${result.removedDirs} chunk folder${result.removedDirs === 1 ? '' : 's'}.`;
        return { summary, data: { ...result } };
      },
    },
  };
}
