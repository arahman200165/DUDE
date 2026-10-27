import { transaction } from '@dude/sqlite-store';
import type { Db } from '@dude/sqlite-store';
import { HUB_QUEUE_RECENT_FAILURES_MAX, HUB_QUEUE_STATES } from '@dude/contracts/hub';
import type { HubQueueState, HubQueueStatusResponse } from '@dude/contracts/hub';
import { newId } from '../util/ids.js';
import { JOB_KINDS } from './job-kinds.js';
import { assertQueuePayload, redactJobError } from './redact.js';

export const DEFAULT_MAX_ATTEMPTS = 5;
export const DEFAULT_LEASE_MS = 60_000;
export const MAX_PAYLOAD_BYTES = 64 * 1024;
/** A stored result summary; a bigger one is dropped (the job still succeeds). */
export const MAX_RESULT_BYTES = 16 * 1024;
/** Finished jobs are kept for diagnosis this long, then pruned by the runner. */
export const SUCCEEDED_RETENTION_MS = 7 * 24 * 3600_000;
export const FAILED_RETENTION_MS = 30 * 24 * 3600_000;

export interface BackoffPolicy {
  baseMs: number;
  maxMs: number;
}
export const DEFAULT_BACKOFF: BackoffPolicy = { baseMs: 5_000, maxMs: 15 * 60_000 };
/** Retry delay after the `attempt`-th failed attempt (1-based): base, 2x base, 4x base ... capped. */
export const backoffDelay = (policy: BackoffPolicy, attempt: number): number =>
  Math.min(policy.maxMs, policy.baseMs * 2 ** Math.max(0, Math.min(30, attempt - 1)));

export interface EnqueueInput {
  kind: string;
  /** Plain JSON, at most 64 KiB, with no credential-looking key at any depth. Workers receive it; it is stored as is. */
  payload?: unknown;
  /** While a job with this key is queued or running, enqueuing it again returns that job instead of adding one. */
  idempotencyKey?: string;
  /** Higher runs first (interactive work outranks bulk work). Default 0. */
  priority?: number;
  maxAttempts?: number;
  /** Earliest start, epoch ms. Default now. */
  runAfter?: number;
}

export interface ClaimedJob {
  id: string;
  kind: string;
  payload: unknown;
  /** Claims so far, including this one (1 on the first run). */
  attempt: number;
  maxAttempts: number;
  leaseExpiresAt: number;
}

export type FailResult = 'retried' | 'dead' | 'failed' | 'lost';

export interface JobQueueOptions {
  db: Db;
  now?: () => number;
  /** The kinds `enqueue` accepts; defaults to the closed production list. Specs widen it. */
  kinds?: readonly string[];
  backoff?: BackoffPolicy;
}

export interface JobQueue {
  enqueue(input: EnqueueInput): { id: string; created: boolean };
  /** Atomically leases the best runnable job (highest priority, then oldest `run_after`) to `owner`, or returns undefined. */
  claim(owner: string, options?: { leaseMs?: number; kinds?: readonly string[] }): ClaimedJob | undefined;
  /** Extends the lease; false when `owner` no longer holds the job (it expired and was recovered or re-claimed). */
  heartbeat(id: string, owner: string, leaseMs?: number): boolean;
  /** Marks the job succeeded; false when `owner` no longer holds it. */
  complete(id: string, owner: string, result?: unknown): boolean;
  /**
   * Records a failed attempt. A retryable failure returns the job to `queued` with exponential backoff, or to `dead` when the
   * attempts are used up; a non-retryable one ends it as `failed`. `lost` means `owner` no longer holds the job.
   */
  fail(id: string, owner: string, error: unknown, options?: { retryable?: boolean }): FailResult;
  /** Gives a held job back without counting the attempt (graceful shutdown). */
  release(id: string, owner: string): boolean;
  /** Returns jobs whose lease expired (their worker died) to the queue, or to `dead` when no attempt is left. */
  recoverExpired(): { requeued: number; dead: number };
  /** Removes finished jobs past their retention; returns how many. */
  prune(): number;
  status(): HubQueueStatusResponse;
}

const isoOf = (ms: number): string => new Date(ms).toISOString();
const LEASE_EXPIRED = 'The worker stopped responding (lease expired).';

interface JobRow {
  id: string;
  kind: string;
  payload_json: string;
  attempts: number | bigint;
  max_attempts: number | bigint;
  lease_expires_at: number | bigint;
}

type Counts = Record<HubQueueState, number>;
const zeroCounts = (): Counts => Object.fromEntries(HUB_QUEUE_STATES.map((state) => [state, 0])) as Counts;

/**
 * The durable job queue over `savesphere.db`'s `jobs` table (32-SS1, PD-147). Every state change is one statement or one
 * `BEGIN IMMEDIATE` transaction, and every holder-side change names the lease owner, so a worker whose lease expired can never
 * complete, fail or heartbeat a job that has been recovered or claimed by someone else. A claim counts as an attempt, which is
 * what makes a crash mid-job retry (and eventually dead-letter) instead of looping forever. Internal API only: there is no route
 * that enqueues, and `kinds` is a closed list.
 */
export function createJobQueue(options: JobQueueOptions): JobQueue {
  const { db } = options;
  const now = options.now ?? Date.now;
  const kinds = new Set<string>(options.kinds ?? JOB_KINDS);
  const backoff = options.backoff ?? DEFAULT_BACKOFF;

  /** The state after a failed attempt, given the attempts already used (the claim counted this one). */
  const afterFailure = (attempts: number, max: number, retryable: boolean): 'queued' | 'dead' | 'failed' =>
    !retryable ? 'failed' : attempts >= max ? 'dead' : 'queued';

  return {
    enqueue(input) {
      if (!kinds.has(input.kind)) throw new Error(`Unknown job kind "${input.kind}".`);
      const payload = assertQueuePayload(input.payload ?? {}, MAX_PAYLOAD_BYTES);
      const key = input.idempotencyKey;
      if (key !== undefined && (key.length === 0 || key.length > 256)) throw new Error('A job idempotency key must be 1 to 256 characters.');
      const maxAttempts = Math.max(1, Math.min(20, Math.trunc(input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS)));
      const at = now();
      return transaction(db, () => {
        if (key !== undefined) {
          const existing = db.prepare("SELECT id FROM jobs WHERE idempotency_key = ? AND state IN ('queued', 'running')").get(key) as { id: string } | undefined;
          if (existing !== undefined) return { id: existing.id, created: false };
        }
        const id = newId(now);
        db.prepare(
          'INSERT INTO jobs(id, kind, payload_json, idempotency_key, state, max_attempts, priority, run_after, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        ).run(id, input.kind, payload, key ?? null, 'queued', maxAttempts, Math.trunc(input.priority ?? 0), Math.trunc(input.runAfter ?? at), at, at);
        return { id, created: true };
      });
    },

    claim(owner, claimOptions = {}) {
      const at = now();
      const leaseMs = claimOptions.leaseMs ?? DEFAULT_LEASE_MS;
      const wanted = (claimOptions.kinds ?? [...kinds]).filter((kind) => kinds.has(kind));
      if (wanted.length === 0) return undefined;
      const marks = wanted.map(() => '?').join(', ');
      const row = transaction(db, () => db.prepare(
        `UPDATE jobs SET state = 'running', attempts = attempts + 1, lease_owner = ?, lease_expires_at = ?, updated_at = ?
         WHERE id = (SELECT id FROM jobs WHERE state = 'queued' AND run_after <= ? AND kind IN (${marks}) ORDER BY priority DESC, run_after ASC, rowid ASC LIMIT 1)
         RETURNING id, kind, payload_json, attempts, max_attempts, lease_expires_at`,
      ).get(owner, at + leaseMs, at, at, ...wanted) as JobRow | undefined);
      if (row === undefined) return undefined;
      let payload: unknown = {};
      try { payload = JSON.parse(row.payload_json); } catch { /* an unreadable payload runs as empty; the handler validates */ }
      return { id: row.id, kind: row.kind, payload, attempt: Number(row.attempts), maxAttempts: Number(row.max_attempts), leaseExpiresAt: Number(row.lease_expires_at) };
    },

    heartbeat(id, owner, leaseMs = DEFAULT_LEASE_MS) {
      const at = now();
      return Number(db.prepare("UPDATE jobs SET lease_expires_at = ?, updated_at = ? WHERE id = ? AND state = 'running' AND lease_owner = ?").run(at + leaseMs, at, id, owner).changes) > 0;
    },

    complete(id, owner, result) {
      const at = now();
      let json: string | null = null;
      if (result !== undefined) {
        const text = JSON.stringify(result) as string | undefined;
        if (text !== undefined && Buffer.byteLength(text) <= MAX_RESULT_BYTES) json = text;
      }
      return Number(db.prepare(
        "UPDATE jobs SET state = 'succeeded', lease_owner = NULL, lease_expires_at = NULL, finished_at = ?, updated_at = ?, last_error = NULL, result_json = ? WHERE id = ? AND state = 'running' AND lease_owner = ?",
      ).run(at, at, json, id, owner).changes) > 0;
    },

    fail(id, owner, error, failOptions = {}) {
      const at = now();
      const note = redactJobError(error);
      return transaction(db, () => {
        const row = db.prepare("SELECT attempts, max_attempts FROM jobs WHERE id = ? AND state = 'running' AND lease_owner = ?").get(id, owner) as { attempts: number | bigint; max_attempts: number | bigint } | undefined;
        if (row === undefined) return 'lost';
        const attempts = Number(row.attempts);
        const next = afterFailure(attempts, Number(row.max_attempts), failOptions.retryable !== false);
        if (next === 'queued') {
          db.prepare("UPDATE jobs SET state = 'queued', lease_owner = NULL, lease_expires_at = NULL, run_after = ?, updated_at = ?, last_error = ? WHERE id = ?")
            .run(at + backoffDelay(backoff, attempts), at, note, id);
          return 'retried';
        }
        db.prepare('UPDATE jobs SET state = ?, lease_owner = NULL, lease_expires_at = NULL, finished_at = ?, updated_at = ?, last_error = ? WHERE id = ?').run(next, at, at, note, id);
        return next;
      });
    },

    release(id, owner) {
      const at = now();
      return Number(db.prepare(
        "UPDATE jobs SET state = 'queued', attempts = MAX(0, attempts - 1), lease_owner = NULL, lease_expires_at = NULL, run_after = ?, updated_at = ? WHERE id = ? AND state = 'running' AND lease_owner = ?",
      ).run(at, at, id, owner).changes) > 0;
    },

    recoverExpired() {
      const at = now();
      return transaction(db, () => {
        const expired = db.prepare("SELECT id, attempts, max_attempts FROM jobs WHERE state = 'running' AND lease_expires_at <= ?").all(at) as Array<{ id: string; attempts: number | bigint; max_attempts: number | bigint }>;
        let requeued = 0;
        let dead = 0;
        for (const job of expired) {
          const attempts = Number(job.attempts);
          if (afterFailure(attempts, Number(job.max_attempts), true) === 'dead') {
            db.prepare("UPDATE jobs SET state = 'dead', lease_owner = NULL, lease_expires_at = NULL, finished_at = ?, updated_at = ?, last_error = ? WHERE id = ?").run(at, at, LEASE_EXPIRED, job.id);
            dead += 1;
          } else {
            db.prepare("UPDATE jobs SET state = 'queued', lease_owner = NULL, lease_expires_at = NULL, run_after = ?, updated_at = ?, last_error = ? WHERE id = ?")
              .run(at + backoffDelay(backoff, attempts), at, LEASE_EXPIRED, job.id);
            requeued += 1;
          }
        }
        return { requeued, dead };
      });
    },

    prune() {
      const at = now();
      const done = Number(db.prepare("DELETE FROM jobs WHERE state = 'succeeded' AND finished_at < ?").run(at - SUCCEEDED_RETENTION_MS).changes);
      const stopped = Number(db.prepare("DELETE FROM jobs WHERE state IN ('failed', 'dead') AND finished_at < ?").run(at - FAILED_RETENTION_MS).changes);
      return done + stopped;
    },

    status() {
      const counts = zeroCounts();
      const byKind = new Map<string, Counts>();
      const rows = db.prepare('SELECT kind, state, COUNT(*) AS n FROM jobs GROUP BY kind, state ORDER BY kind').all() as Array<{ kind: string; state: HubQueueState; n: number | bigint }>;
      for (const row of rows) {
        if (!(HUB_QUEUE_STATES as readonly string[]).includes(row.state)) continue;
        counts[row.state] += Number(row.n);
        const entry = byKind.get(row.kind) ?? zeroCounts();
        entry[row.state] += Number(row.n);
        byKind.set(row.kind, entry);
      }
      const oldest = db.prepare("SELECT MIN(created_at) AS at FROM jobs WHERE state = 'queued'").get() as { at: number | bigint | null };
      const failures = db.prepare(
        `SELECT id, kind, state, attempts, max_attempts, finished_at, last_error FROM jobs WHERE state IN ('failed', 'dead') ORDER BY finished_at DESC, rowid DESC LIMIT ${HUB_QUEUE_RECENT_FAILURES_MAX}`,
      ).all() as Array<{ id: string; kind: string; state: 'failed' | 'dead'; attempts: number | bigint; max_attempts: number | bigint; finished_at: number | bigint; last_error: string | null }>;
      return {
        available: true,
        counts,
        kinds: [...byKind.entries()].map(([kind, entry]) => ({ kind, ...entry })),
        oldestQueuedAt: oldest.at === null ? null : isoOf(Number(oldest.at)),
        recentFailures: failures.map((f) => ({
          id: f.id, kind: f.kind, state: f.state, attempts: Number(f.attempts), maxAttempts: Number(f.max_attempts),
          finishedAt: isoOf(Number(f.finished_at)), lastError: redactJobError(f.last_error ?? 'The job failed.'),
        })),
      };
    },
  };
}

/** The status of a Hub whose SaveSphere storage does not exist yet. */
export const UNAVAILABLE_QUEUE_STATUS: HubQueueStatusResponse = {
  available: false,
  counts: { queued: 0, running: 0, succeeded: 0, failed: 0, dead: 0 },
  kinds: [],
  oldestQueuedAt: null,
  recentFailures: [],
};
