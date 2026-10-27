import { transaction } from '@dude/sqlite-store';
import type { Db } from '@dude/sqlite-store';
import { assertBlobHash } from './blob-store.js';

/** The catalogue in `savesphere.db` (migration 0002): which blobs exist and who references them. */
export type BlobState = 'ok' | 'corrupt' | 'missing' | 'deleting';

export interface BlobRow {
  sha256: string;
  size: number;
  createdAt: string;
  verifiedAt: string | null;
  state: BlobState;
  unreferencedSince: string | null;
}

export interface BlobRefInput {
  sha256: string;
  /** What kind of thing holds the reference, for example `attachment`; lowercase letters, digits, `.`, `_`, `-`. */
  ownerKind: string;
  ownerId: string;
  now: number;
}

export class BlobCatalogueError extends Error {
  constructor(readonly code: 'not-recorded' | 'deleting' | 'bad-owner' | 'size-mismatch', message: string) {
    super(message);
    this.name = 'BlobCatalogueError';
  }
}

interface RawBlobRow {
  sha256: string;
  size: number;
  created_at: string;
  verified_at: string | null;
  state: BlobState;
  unreferenced_since: string | null;
}

const OWNER_KIND = /^[a-z][a-z0-9._-]{0,63}$/;
const iso = (ms: number): string => new Date(ms).toISOString();

const toRow = (raw: RawBlobRow): BlobRow => ({
  sha256: raw.sha256, size: Number(raw.size), createdAt: raw.created_at, verifiedAt: raw.verified_at, state: raw.state, unreferencedSince: raw.unreferenced_since,
});

function assertOwner(ownerKind: string, ownerId: string): void {
  if (!OWNER_KIND.test(ownerKind) || ownerId.length === 0 || ownerId.length > 256) {
    throw new BlobCatalogueError('bad-owner', 'A blob reference needs an owner kind (lowercase, at most 64 characters) and an owner id (1 to 256 characters).');
  }
}

export function getBlobRow(db: Db, sha256: string): BlobRow | undefined {
  assertBlobHash(sha256);
  const raw = db.prepare('SELECT sha256, size, created_at, verified_at, state, unreferenced_since FROM blobs WHERE sha256 = ?').get(sha256) as RawBlobRow | undefined;
  return raw === undefined ? undefined : toRow(raw);
}

/**
 * Records a stored blob after `BlobStore.put` (call it in the transaction that also adds the first reference). A new row starts
 * unreferenced (its grace period starts now); an existing row keeps its state, except that a re-put that really wrote the bytes
 * (`created`) heals a `missing` row. Re-recording an unreferenced blob restarts its grace period so a fresh upload of old content
 * is not collected from under the uploader. A blob being deleted refuses (the caller re-puts and retries).
 */
export function recordBlob(db: Db, input: { sha256: string; size: number; now: number; created?: boolean }): BlobRow {
  assertBlobHash(input.sha256);
  return transaction(db, () => {
    const existing = getBlobRow(db, input.sha256);
    if (existing === undefined) {
      db.prepare('INSERT INTO blobs(sha256, size, created_at, verified_at, state, unreferenced_since) VALUES(?, ?, ?, NULL, ?, ?)')
        .run(input.sha256, input.size, iso(input.now), 'ok', iso(input.now));
    } else {
      if (existing.state === 'deleting') throw new BlobCatalogueError('deleting', 'The blob is being deleted; store it again.');
      if (existing.size !== input.size) throw new BlobCatalogueError('size-mismatch', 'The recorded size differs from the stored size.');
      if (blobRefCount(db, input.sha256) === 0) db.prepare('UPDATE blobs SET unreferenced_since = ? WHERE sha256 = ?').run(iso(input.now), input.sha256);
      if (input.created === true && existing.state === 'missing') db.prepare("UPDATE blobs SET state = 'ok', verified_at = ? WHERE sha256 = ?").run(iso(input.now), input.sha256);
    }
    return getBlobRow(db, input.sha256) as BlobRow;
  });
}

/** Adds one reference; returns false when that exact `(owner, blob)` reference already existed. Safe inside a caller's transaction. */
export function addBlobRef(db: Db, input: BlobRefInput): boolean {
  assertBlobHash(input.sha256);
  assertOwner(input.ownerKind, input.ownerId);
  return transaction(db, () => {
    const blob = getBlobRow(db, input.sha256);
    if (blob === undefined) throw new BlobCatalogueError('not-recorded', 'The blob is not recorded; record it before referencing it.');
    if (blob.state === 'deleting') throw new BlobCatalogueError('deleting', 'The blob is being deleted; store it again.');
    const result = db.prepare('INSERT INTO blob_refs(blob_sha256, owner_kind, owner_id, created_at) VALUES(?, ?, ?, ?) ON CONFLICT DO NOTHING')
      .run(input.sha256, input.ownerKind, input.ownerId, iso(input.now));
    db.prepare('UPDATE blobs SET unreferenced_since = NULL WHERE sha256 = ?').run(input.sha256);
    return Number(result.changes) > 0;
  });
}

/** Removes one reference; when it was the last, the blob's grace period starts now. Returns false when it did not exist. */
export function removeBlobRef(db: Db, input: BlobRefInput): boolean {
  assertBlobHash(input.sha256);
  assertOwner(input.ownerKind, input.ownerId);
  return transaction(db, () => {
    const result = db.prepare('DELETE FROM blob_refs WHERE blob_sha256 = ? AND owner_kind = ? AND owner_id = ?').run(input.sha256, input.ownerKind, input.ownerId);
    if (Number(result.changes) === 0) return false;
    markIfUnreferenced(db, input.sha256, input.now);
    return true;
  });
}

/** Removes every reference an owner holds (for example when an item is purged); returns how many references went. */
export function removeOwnerBlobRefs(db: Db, ownerKind: string, ownerId: string, now: number): number {
  assertOwner(ownerKind, ownerId);
  return transaction(db, () => {
    const hashes = (db.prepare('SELECT blob_sha256 FROM blob_refs WHERE owner_kind = ? AND owner_id = ?').all(ownerKind, ownerId) as Array<{ blob_sha256: string }>).map((r) => r.blob_sha256);
    db.prepare('DELETE FROM blob_refs WHERE owner_kind = ? AND owner_id = ?').run(ownerKind, ownerId);
    for (const sha256 of hashes) markIfUnreferenced(db, sha256, now);
    return hashes.length;
  });
}

function markIfUnreferenced(db: Db, sha256: string, now: number): void {
  if (blobRefCount(db, sha256) === 0) db.prepare('UPDATE blobs SET unreferenced_since = ? WHERE sha256 = ?').run(iso(now), sha256);
}

export function blobRefCount(db: Db, sha256: string): number {
  assertBlobHash(sha256);
  return Number((db.prepare('SELECT COUNT(*) AS n FROM blob_refs WHERE blob_sha256 = ?').get(sha256) as { n: number }).n);
}
