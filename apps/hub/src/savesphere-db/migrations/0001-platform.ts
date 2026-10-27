import type { Migration } from '@dude/sqlite-store';

/**
 * SaveSphere content store schema v1 (32-SS1, Milestone 832, PD-146). `savesphere.db` is a separate file with its own numbered
 * sequence and reader floor, and there is no cross-file `ATTACH`. This step holds only what the platform foundation uses:
 * `meta` and `schema_migrations` (the runner's own bookkeeping) and `audit_outbox`. Content tables arrive with the milestone
 * that first writes them. `audit_outbox` rows are written in the same transaction as the content change they describe and are
 * drained into `dude.db`'s audit log after commit (`dedupe_key` makes the hand-over idempotent). Timestamps are ISO-8601 TEXT.
 * Never edit once shipped.
 */
export const saveSphereMigration0001: Migration = {
  version: 1,
  name: 'platform',
  minReaderVersion: 1,
  sql: `
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, checksum TEXT NOT NULL, applied_at TEXT NOT NULL) STRICT;
CREATE TABLE audit_outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event TEXT NOT NULL,
  outcome TEXT NOT NULL,
  actor_kind TEXT NOT NULL,
  actor_id TEXT,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  drained_at TEXT,
  dedupe_key TEXT NOT NULL UNIQUE
) STRICT;
CREATE INDEX idx_audit_outbox_pending ON audit_outbox(id) WHERE drained_at IS NULL;
`,
};
