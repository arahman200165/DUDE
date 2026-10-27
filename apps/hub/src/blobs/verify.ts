import { transaction } from '@dude/sqlite-store';
import type { Db } from '@dude/sqlite-store';
import { appendAuditOutbox } from '../savesphere-db/audit-outbox.js';
import type { BlobStore } from './blob-store.js';

export interface VerifyBlobBatchDeps {
  db: Db;
  store: Pick<BlobStore, 'verify'>;
  now: () => number;
  /** How many blobs to re-hash this run (the least recently verified first). Default 25. */
  limit?: number;
  /** Called after a run that wrote audit outbox rows, so the caller can drain them into `dude.db`. */
  afterCommit?: () => void;
}

export interface VerifyBlobBatchResult {
  checked: number;
  ok: number;
  corrupt: string[];
  missing: string[];
}

export const DEFAULT_VERIFY_BATCH = 25;

/**
 * Re-hashes the `limit` blobs that were verified longest ago (never-verified first), streaming each file, and records the outcome:
 * `verified_at` is stamped on a healthy blob, and a corrupt or missing one is marked (`state`) and reported by a
 * `blobs.verify-failed` audit event through the outbox in the same transaction as the mark. A blob already marked corrupt or
 * missing is not re-checked (it would re-report every run); a blob garbage collection is deleting is skipped. The job queue
 * (Milestone 834) calls this on a timer; this function registers nothing and never throws for a bad blob, only for an I/O error
 * it cannot classify.
 */
export async function verifyBlobBatch(deps: VerifyBlobBatchDeps): Promise<VerifyBlobBatchResult> {
  const limit = Math.max(1, Math.min(1000, Math.floor(deps.limit ?? DEFAULT_VERIFY_BATCH)));
  const batch = deps.db.prepare("SELECT sha256, size FROM blobs WHERE state = 'ok' ORDER BY COALESCE(verified_at, '') ASC, sha256 ASC LIMIT ?").all(limit) as Array<{ sha256: string; size: number }>;
  const result: VerifyBlobBatchResult = { checked: 0, ok: 0, corrupt: [], missing: [] };
  for (const blob of batch) {
    const outcome = await deps.store.verify(blob.sha256);
    const at = new Date(deps.now()).toISOString();
    transaction(deps.db, () => {
      // Re-read inside the transaction: garbage collection may have claimed the row while the file was hashing.
      const current = deps.db.prepare('SELECT state FROM blobs WHERE sha256 = ?').get(blob.sha256) as { state: string } | undefined;
      if (current === undefined || current.state !== 'ok') return;
      result.checked += 1;
      if (outcome === 'ok') {
        deps.db.prepare('UPDATE blobs SET verified_at = ? WHERE sha256 = ?').run(at, blob.sha256);
        result.ok += 1;
        return;
      }
      deps.db.prepare('UPDATE blobs SET state = ?, verified_at = ? WHERE sha256 = ?').run(outcome, at, blob.sha256);
      (outcome === 'corrupt' ? result.corrupt : result.missing).push(blob.sha256);
      appendAuditOutbox(deps.db, {
        event: 'blobs.verify-failed',
        outcome: 'failure',
        detail: { sha256: blob.sha256, reason: outcome, size: Number(blob.size) },
        dedupeKey: `blobs.verify-failed:${blob.sha256}:${outcome}:${at}`,
        now: deps.now(),
      });
    });
  }
  if (result.corrupt.length + result.missing.length > 0) deps.afterCommit?.();
  return result;
}
