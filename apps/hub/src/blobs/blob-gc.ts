import { createHash } from 'node:crypto';
import { transaction } from '@dude/sqlite-store';
import type { Db } from '@dude/sqlite-store';
import { appendAuditOutbox } from '../savesphere-db/audit-outbox.js';
import { ConfirmationStore } from '../security/confirmation-store.js';
import type { BlobStore } from './blob-store.js';
import { isBlobHash } from './blob-store.js';
import { releaseBlobLease, renewBlobLease, tryAcquireBlobLease } from './lease.js';
import type { BlobState } from './registry.js';

/**
 * Mark-and-sweep garbage collection of the blob store (32-SS1, Milestone 833, PD-148), under the Destructive-Action Contract.
 * A blob is a candidate when no `blob_refs` row points at it and it has been unreferenced for at least the grace period. Step
 * one (`previewBlobGc`) writes nothing and stages a single-use, 60-second token bound to the exact candidate set; step two
 * (`applyBlobGc`) takes the blob lease, spends the token, re-checks every candidate inside a transaction (a blob that gained a
 * reference or fell back inside the grace period since the preview is skipped, never deleted), marks it `deleting`, removes the
 * file, then the row. Admin methods wrap these in Milestone 835; the backup engine takes the same lease (Milestone 847).
 */
export const BLOB_GC_ACTION = 'blobs.gc';
/** Subset of the repo's `ConsequenceClass` vocabulary (the Hub cannot import `@dude/domain`): file deletion plus catalogue rows. */
export const BLOB_GC_CONSEQUENCE_CLASS = ['filesystem-write', 'database-write'] as const;
export const DEFAULT_BLOB_GC_GRACE_MS = 7 * 24 * 3600_000;
/** A grace period shorter than this is refused, so an upload in flight is never collected. */
export const MIN_BLOB_GC_GRACE_MS = 3600_000;
export const BLOB_GC_PLAN_LIMIT = 10_000;
const BLOB_GC_BINDING = 'cli';
const LEASE_RENEW_EVERY = 50;

export interface BlobGcCandidate {
  sha256: string;
  size: number;
  state: BlobState;
  unreferencedSince: string;
}

export interface BlobGcPlan {
  graceMs: number;
  plannedAt: string;
  /** Candidates were unreferenced since this instant or earlier. */
  cutoff: string;
  blobs: BlobGcCandidate[];
  totalBytes: number;
  /** More candidates exist than `BLOB_GC_PLAN_LIMIT`; run GC again after this one. */
  truncated: boolean;
  /** SHA-256 over the grace period and the exact candidate list; the confirmation token is bound to it. */
  digest: string;
}

export class BlobGcError extends Error {
  constructor(readonly code: 'confirmation-required' | 'plan-mismatch' | 'invalid-plan' | 'lease-held' | 'grace-too-short', message: string) {
    super(message);
    this.name = 'BlobGcError';
  }
}

export function blobGcDigest(graceMs: number, blobs: ReadonlyArray<Pick<BlobGcCandidate, 'sha256' | 'size'>>): string {
  const hash = createHash('sha256').update(`blobs.gc/v1\n${graceMs}\n`);
  for (const blob of blobs) hash.update(`${blob.sha256}:${blob.size}\n`);
  return hash.digest('hex');
}

function assertGrace(graceMs: number): void {
  if (!Number.isFinite(graceMs) || graceMs < MIN_BLOB_GC_GRACE_MS) {
    throw new BlobGcError('grace-too-short', `The grace period must be at least ${MIN_BLOB_GC_GRACE_MS / 60_000} minutes.`);
  }
}

interface CandidateRow { sha256: string; size: number; state: BlobState; unreferenced_since: string }

/** Read-only: lists the unreferenced blobs past the grace period, oldest first. Never writes and never touches the filesystem. */
export function planBlobGc(db: Db, options: { graceMs: number; now: number; limit?: number }): BlobGcPlan {
  if (!Number.isFinite(options.graceMs) || options.graceMs < 0) throw new BlobGcError('grace-too-short', 'The grace period must not be negative.');
  const limit = Math.max(1, Math.min(BLOB_GC_PLAN_LIMIT, Math.floor(options.limit ?? BLOB_GC_PLAN_LIMIT)));
  const cutoff = new Date(options.now - options.graceMs).toISOString();
  const rows = db.prepare(
    `SELECT b.sha256, b.size, b.state, b.unreferenced_since FROM blobs b
     WHERE b.unreferenced_since IS NOT NULL AND b.unreferenced_since <= ?
       AND NOT EXISTS (SELECT 1 FROM blob_refs r WHERE r.blob_sha256 = b.sha256)
     ORDER BY b.unreferenced_since ASC, b.sha256 ASC LIMIT ?`,
  ).all(cutoff, limit + 1) as unknown as CandidateRow[];
  const truncated = rows.length > limit;
  const blobs = rows.slice(0, limit).map((r) => ({ sha256: r.sha256, size: Number(r.size), state: r.state, unreferencedSince: r.unreferenced_since }));
  return {
    graceMs: options.graceMs,
    plannedAt: new Date(options.now).toISOString(),
    cutoff,
    blobs,
    totalBytes: blobs.reduce((sum, b) => sum + b.size, 0),
    truncated,
    digest: blobGcDigest(options.graceMs, blobs),
  };
}

export interface BlobGcDeps {
  db: Db;
  store: Pick<BlobStore, 'delete'>;
  confirmations: ConfirmationStore;
  now: () => number;
  /** Called after the audit outbox row is committed, so the caller can drain it into `dude.db`. */
  afterCommit?: () => void;
}

export interface BlobGcPreview {
  plan: BlobGcPlan;
  confirmToken: string;
  expiresAt: string;
  consequenceClass: readonly string[];
}

/** Step one. Writes nothing (no row, no audit, no file); only stages the in-memory confirmation. */
export function previewBlobGc(deps: BlobGcDeps, options: { graceMs?: number; limit?: number } = {}): BlobGcPreview {
  const graceMs = options.graceMs ?? DEFAULT_BLOB_GC_GRACE_MS;
  assertGrace(graceMs);
  const at = deps.now();
  const plan = planBlobGc(deps.db, { graceMs, now: at, ...(options.limit === undefined ? {} : { limit: options.limit }) });
  const confirmToken = deps.confirmations.issue({ action: BLOB_GC_ACTION, digest: plan.digest, bindingId: BLOB_GC_BINDING, now: at });
  return { plan, confirmToken, expiresAt: ConfirmationStore.expiresAt(at), consequenceClass: BLOB_GC_CONSEQUENCE_CLASS };
}

export interface BlobGcResult {
  deleted: number;
  bytes: number;
  skipped: Array<{ sha256: string; reason: 'gone' | 'referenced' | 'within-grace' | 'delete-failed' }>;
}

function validatePlan(plan: BlobGcPlan): void {
  const ok = plan !== null && typeof plan === 'object' && Array.isArray(plan.blobs) && typeof plan.digest === 'string' && Number.isFinite(plan.graceMs)
    && plan.blobs.every((b) => b !== null && typeof b === 'object' && isBlobHash(b.sha256) && Number.isSafeInteger(b.size));
  if (!ok || blobGcDigest(plan.graceMs, plan.blobs) !== plan.digest) throw new BlobGcError('invalid-plan', 'The plan is malformed or was altered.');
  assertGrace(plan.graceMs);
}

/**
 * Step two. Order matters: the lease first (a refused apply keeps the token valid), then the token (single-use, bound to the
 * digest recomputed from the plan actually presented), then the sweep.
 */
export async function applyBlobGc(deps: BlobGcDeps, input: { plan: BlobGcPlan; confirmToken: string }): Promise<BlobGcResult> {
  validatePlan(input.plan);
  const startedAt = deps.now();
  const lease = tryAcquireBlobLease(deps.db, 'gc', startedAt);
  if (!lease.acquired) throw new BlobGcError('lease-held', `The blob store is leased by ${lease.blockedBy.join(', ')}; try again when it finishes.`);
  try {
    const verdict = deps.confirmations.consumeDetailed({ token: input.confirmToken, action: BLOB_GC_ACTION, digest: blobGcDigest(input.plan.graceMs, input.plan.blobs), bindingId: BLOB_GC_BINDING, now: startedAt });
    if (verdict === 'invalid') throw new BlobGcError('confirmation-required', 'The confirmation is missing, expired or already used.');
    if (verdict === 'digest-mismatch') throw new BlobGcError('plan-mismatch', 'The plan differs from the one that was previewed. Run the preview again.');

    const result: BlobGcResult = { deleted: 0, bytes: 0, skipped: [] };
    // The apply-time cutoff is never earlier than the plan's, so a blob can only drop out of the sweep, never join it.
    const cutoff = new Date(Math.max(deps.now(), startedAt) - input.plan.graceMs).toISOString();
    let processed = 0;
    for (const candidate of input.plan.blobs) {
      processed += 1;
      if (processed % LEASE_RENEW_EVERY === 0) renewBlobLease(deps.db, 'gc', deps.now());
      const claim = transaction(deps.db, (): 'claimed' | 'gone' | 'referenced' | 'within-grace' => {
        const row = deps.db.prepare('SELECT size, unreferenced_since FROM blobs WHERE sha256 = ?').get(candidate.sha256) as { size: number; unreferenced_since: string | null } | undefined;
        if (row === undefined) return 'gone';
        const refs = deps.db.prepare('SELECT COUNT(*) AS n FROM blob_refs WHERE blob_sha256 = ?').get(candidate.sha256) as { n: number };
        if (Number(refs.n) > 0) return 'referenced';
        if (row.unreferenced_since === null || row.unreferenced_since > cutoff) return 'within-grace';
        deps.db.prepare("UPDATE blobs SET state = 'deleting' WHERE sha256 = ?").run(candidate.sha256);
        return 'claimed';
      });
      if (claim !== 'claimed') {
        result.skipped.push({ sha256: candidate.sha256, reason: claim });
        continue;
      }
      try {
        await deps.store.delete(candidate.sha256);
      } catch {
        // The row stays `deleting` (it refuses new references) and the next GC retries it.
        result.skipped.push({ sha256: candidate.sha256, reason: 'delete-failed' });
        continue;
      }
      deps.db.prepare("DELETE FROM blobs WHERE sha256 = ? AND state = 'deleting'").run(candidate.sha256);
      result.deleted += 1;
      result.bytes += candidate.size;
    }
    transaction(deps.db, () => {
      appendAuditOutbox(deps.db, {
        event: 'blobs.gc-applied',
        outcome: 'success',
        actorKind: 'cli',
        detail: { deleted: result.deleted, bytes: result.bytes, skipped: result.skipped.length, graceMs: input.plan.graceMs },
        dedupeKey: `blobs.gc-applied:${input.plan.digest}:${startedAt}`,
        now: deps.now(),
      });
    });
    deps.afterCommit?.();
    return result;
  } finally {
    releaseBlobLease(deps.db, 'gc');
  }
}
