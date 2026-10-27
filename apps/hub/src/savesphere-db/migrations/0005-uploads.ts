import type { Migration } from '@dude/sqlite-store';

/**
 * SaveSphere content store schema v5 (32-SS1, Milestone 845, PD-118, PD-148): resumable chunked upload sessions. Both tables are
 * TRANSIENT operational state (`SAVESPHERE_SCRUBBED_TABLES`): a restored Hub starts with no sessions, because the chunk files under
 * `storage/uploads` are not part of a backup and a half-received upload means nothing on another machine. A completed upload's blob and its
 * `blob_refs` row (owner kind `upload`) ARE kept content metadata; the expiry job releases an `upload` reference whose session row no
 * longer exists (the restore case), so a restored Hub does not hold a blob forever for a session it never had.
 *
 * `uploads`: `state` is `open`, `completing`, `complete`, `failed`, `aborted` or `expired` (the last four are final). `declared_size` is
 * the whole file's byte length; `declared_sha256` is the caller's optional whole-file hash. `chunk_size` and `chunk_count` are fixed at
 * creation. `mime` and `name` are sanitized display metadata and never used to build a path (chunk files are
 * `storage/uploads/<id>/<index>.part`, `<id>` being a random UUID generated here). `principal_kind` and `principal_id` identify the
 * credential class and principal that created it (`owner` plus the owner id today; the ingest class is 32-SS3's). Times are integer epoch
 * milliseconds like `jobs`: `updated_at` is the last activity, `expires_at` is when the expiry job removes the session (a complete session's
 * reference is released then unless `attached_at` is set). `blob_sha256` is set at completion; `failure` is a closed reason code.
 *
 * `upload_chunks`: one row per received chunk, written AFTER the chunk file is complete, flushed and renamed into place, so a row always
 * names a whole file and a file without a row (a crash in between) is simply not counted and is overwritten by a retry. Never edit once shipped.
 */
export const saveSphereMigration0005: Migration = {
  version: 5,
  name: 'uploads',
  minReaderVersion: 5,
  sql: `
CREATE TABLE uploads (
  id TEXT PRIMARY KEY,
  state TEXT NOT NULL CHECK (state IN ('open', 'completing', 'complete', 'failed', 'aborted', 'expired')),
  declared_size INTEGER NOT NULL CHECK (declared_size >= 1),
  declared_sha256 TEXT CHECK (declared_sha256 IS NULL OR (length(declared_sha256) = 64 AND declared_sha256 NOT GLOB '*[^0-9a-f]*')),
  chunk_size INTEGER NOT NULL CHECK (chunk_size >= 1),
  chunk_count INTEGER NOT NULL CHECK (chunk_count >= 1),
  mime TEXT,
  name TEXT,
  principal_kind TEXT NOT NULL,
  principal_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  completed_at INTEGER,
  blob_sha256 TEXT,
  attached_at INTEGER,
  failure TEXT
) STRICT;
CREATE INDEX idx_uploads_principal_active ON uploads(principal_kind, principal_id) WHERE state IN ('open', 'completing');
CREATE INDEX idx_uploads_expires ON uploads(expires_at);
CREATE TABLE upload_chunks (
  upload_id TEXT NOT NULL REFERENCES uploads(id) ON DELETE CASCADE,
  idx INTEGER NOT NULL CHECK (idx >= 0),
  size INTEGER NOT NULL CHECK (size >= 1),
  sha256 TEXT NOT NULL CHECK (length(sha256) = 64),
  received_at INTEGER NOT NULL,
  PRIMARY KEY (upload_id, idx)
) STRICT, WITHOUT ROWID;
`,
};
