import type { Migration } from '@dude/sqlite-store';

/** Phase 31D sync: per-environment revision index, per-device sync state, compaction floor and retention. Additive. */
export const migration0003: Migration = {
  version: 3,
  name: 'sync',
  minReaderVersion: 1,
  sql: `
CREATE INDEX records_environment_revision ON records (environment_id, revision);
CREATE TABLE device_sync_state (
  device_id TEXT PRIMARY KEY REFERENCES devices(device_id) ON DELETE CASCADE,
  cursor INTEGER NOT NULL DEFAULT 0, reported_json TEXT, last_push_at TEXT, last_pull_at TEXT, updated_at TEXT NOT NULL
) STRICT;
INSERT INTO meta(key, value) VALUES ('sync_floor', '0');
INSERT INTO meta(key, value) VALUES ('sync_retention_days', '90');
`,
};
