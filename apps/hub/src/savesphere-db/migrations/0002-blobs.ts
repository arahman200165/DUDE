import type { Migration } from '@dude/sqlite-store';

/**
 * SaveSphere content store schema v2 (32-SS1, Milestone 833, PD-148): the blob catalogue and its reference counts. The bytes live
 * in `storage/blobs` (`blobs/local-blob-store.ts`); these tables say which blobs exist, whether they were last seen intact, and who
 * references them, so garbage collection can tell an orphan from a live blob. `unreferenced_since` is set when a blob is recorded
 * and whenever its last reference goes, and cleared when a reference is added: the garbage-collection grace period counts from it.
 * `state` is `ok`, `corrupt` or `missing` (set by the verify job) or `deleting` (set by garbage collection between its database
 * and file steps; a `deleting` row refuses new references). A reference is `(owner_kind, owner_id)`, for example `attachment` plus
 * an attachment id; a repeated pair is one reference. Never edit once shipped.
 */
export const saveSphereMigration0002: Migration = {
  version: 2,
  name: 'blobs',
  minReaderVersion: 2,
  sql: `
CREATE TABLE blobs (
  sha256 TEXT PRIMARY KEY CHECK (length(sha256) = 64 AND sha256 NOT GLOB '*[^0-9a-f]*'),
  size INTEGER NOT NULL CHECK (size >= 0),
  created_at TEXT NOT NULL,
  verified_at TEXT,
  state TEXT NOT NULL DEFAULT 'ok' CHECK (state IN ('ok', 'corrupt', 'missing', 'deleting')),
  unreferenced_since TEXT
) STRICT;
CREATE INDEX idx_blobs_verify ON blobs(verified_at) WHERE state = 'ok';
CREATE INDEX idx_blobs_unreferenced ON blobs(unreferenced_since) WHERE unreferenced_since IS NOT NULL;
CREATE TABLE blob_refs (
  blob_sha256 TEXT NOT NULL REFERENCES blobs(sha256),
  owner_kind TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (blob_sha256, owner_kind, owner_id)
) STRICT, WITHOUT ROWID;
CREATE INDEX idx_blob_refs_owner ON blob_refs(owner_kind, owner_id);
`,
};
