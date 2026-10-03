import type { Migration } from './index.js';

/**
 * Hub sync (Phase 31D). Additive, so minReaderVersion stays 1: an older build ignores the new columns and tables.
 * - outbox: why an op was quarantined, how often it was attempted and when.
 * - records.hub_payload_json: the last Hub version of a record, the merge base for three-way merges.
 * - kv_sync: the same Hub revision/base bookkeeping for synced kv keys (which have no `records` row).
 * - sync_state: the single sync row; `categories_json` is the frozen default category map (the repo merges unknown keys
 *   with the live defaults, so a later category needs no migration).
 * - sync_conflicts: merge conflicts waiting for the user.
 * - usage becomes per-device: the existing 'default' usage record (and its outbox op) takes this device's id.
 */
export const migration0003: Migration = {
  version: 3,
  name: 'sync',
  minReaderVersion: 1,
  sql: `
ALTER TABLE outbox ADD COLUMN reason TEXT;
ALTER TABLE outbox ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE outbox ADD COLUMN last_attempt_at TEXT;
ALTER TABLE records ADD COLUMN hub_payload_json TEXT;
CREATE TABLE kv_sync (
  namespace TEXT NOT NULL, key TEXT NOT NULL, hub_revision INTEGER, base_json TEXT,
  PRIMARY KEY (namespace, key)
) STRICT;
CREATE TABLE sync_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  cursor INTEGER NOT NULL DEFAULT 0,
  floor INTEGER NOT NULL DEFAULT 0,
  paused INTEGER NOT NULL DEFAULT 0,
  categories_json TEXT NOT NULL,
  first_sync_state TEXT NOT NULL DEFAULT 'pending' CHECK (first_sync_state IN ('pending', 'done')),
  first_sync_at TEXT,
  last_sync_at TEXT,
  last_error TEXT
) STRICT;
INSERT INTO sync_state(id, cursor, floor, paused, categories_json, first_sync_state)
VALUES(1, 0, 0, 0, '{"settings":true,"favorites":true,"pipelines":true,"projects":true,"workspaces":true,"home":true,"usage":false,"workspace-layout":false,"scratchpad":false}', 'pending');
CREATE TABLE sync_conflicts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('edit-edit', 'edit-delete', 'delete-edit', 'first-sync')),
  local_payload_json TEXT,
  local_deleted INTEGER NOT NULL DEFAULT 0,
  base_payload_json TEXT,
  remote_payload_json TEXT,
  remote_deleted INTEGER NOT NULL DEFAULT 0,
  remote_revision INTEGER,
  fields_json TEXT NOT NULL DEFAULT '[]',
  detected_at TEXT NOT NULL
) STRICT;
CREATE INDEX sync_conflicts_entity ON sync_conflicts (entity_type, entity_id);
UPDATE outbox
   SET entity_id = (SELECT value FROM meta WHERE key = 'device_id'),
       payload_json = CASE WHEN payload_json IS NULL THEN NULL ELSE json_set(payload_json, '$.deviceId', (SELECT value FROM meta WHERE key = 'device_id')) END
 WHERE entity_type = 'usage' AND entity_id = 'default' AND EXISTS (SELECT 1 FROM meta WHERE key = 'device_id');
UPDATE records
   SET entity_id = (SELECT value FROM meta WHERE key = 'device_id'),
       payload_json = json_set(payload_json, '$.deviceId', (SELECT value FROM meta WHERE key = 'device_id'))
 WHERE entity_type = 'usage' AND entity_id = 'default' AND EXISTS (SELECT 1 FROM meta WHERE key = 'device_id');
`,
};
