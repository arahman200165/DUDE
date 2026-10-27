import { getMeta, transaction } from '@dude/sqlite-store';
import type { Db } from '@dude/sqlite-store';

/**
 * The blob lease (32-SS1, Milestone 833, PD-150): a short-lived, mutually exclusive claim on the blob set kept in `savesphere.db`
 * `meta` as `blob_lease:<holder>`. Garbage collection holds `gc` while it deletes; the backup engine (Milestone 847) holds
 * `backup` while it reads the blob set from its snapshot. Neither can take the lease while the other holds an unexpired one, so a
 * backup never sees a blob vanish and GC never runs under a backup. A lease expires on its own (`expiresAt`), so a crashed holder
 * cannot block the other forever; a long run renews it. The keys are transient, so a restored database may carry a stale lease
 * that simply expires.
 */
export const BLOB_LEASE_HOLDERS = ['gc', 'backup'] as const;
export type BlobLeaseHolder = (typeof BLOB_LEASE_HOLDERS)[number];

export const BLOB_LEASE_TTL_MS = 15 * 60_000;
const PREFIX = 'blob_lease:';

export interface BlobLease {
  holder: BlobLeaseHolder;
  expiresAt: number;
}

function read(db: Db, holder: BlobLeaseHolder): BlobLease | undefined {
  const raw = getMeta(db, `${PREFIX}${holder}`);
  if (raw === undefined) return undefined;
  try {
    const parsed = JSON.parse(raw) as { expiresAt?: unknown };
    return typeof parsed.expiresAt === 'number' ? { holder, expiresAt: parsed.expiresAt } : undefined;
  } catch {
    return undefined;
  }
}

/** Every unexpired lease. */
export function activeBlobLeases(db: Db, now: number): BlobLease[] {
  return BLOB_LEASE_HOLDERS.map((holder) => read(db, holder)).filter((lease): lease is BlobLease => lease !== undefined && lease.expiresAt > now);
}

function write(db: Db, holder: BlobLeaseHolder, expiresAt: number): void {
  db.prepare('INSERT INTO meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(`${PREFIX}${holder}`, JSON.stringify({ expiresAt }));
}

/** Takes (or renews) the lease for `holder` unless another holder has an unexpired one. Atomic. Returns the blocking holders when refused. */
export function tryAcquireBlobLease(db: Db, holder: BlobLeaseHolder, now: number, ttlMs: number = BLOB_LEASE_TTL_MS): { acquired: true } | { acquired: false; blockedBy: BlobLeaseHolder[] } {
  return transaction(db, () => {
    const blockedBy = activeBlobLeases(db, now).filter((lease) => lease.holder !== holder).map((lease) => lease.holder);
    if (blockedBy.length > 0) return { acquired: false as const, blockedBy };
    write(db, holder, now + ttlMs);
    return { acquired: true as const };
  });
}

/** Extends a lease the caller holds; a no-op for a lease that is not held. */
export function renewBlobLease(db: Db, holder: BlobLeaseHolder, now: number, ttlMs: number = BLOB_LEASE_TTL_MS): void {
  if (read(db, holder) !== undefined) write(db, holder, now + ttlMs);
}

export function releaseBlobLease(db: Db, holder: BlobLeaseHolder): void {
  db.prepare('DELETE FROM meta WHERE key = ?').run(`${PREFIX}${holder}`);
}
