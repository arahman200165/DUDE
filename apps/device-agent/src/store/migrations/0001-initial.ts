import type { Migration } from './index.js';

export const migration0001: Migration = {
  version: 1,
  name: 'initial',
  minReaderVersion: 1,
  sql: `
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, checksum TEXT NOT NULL, applied_at TEXT NOT NULL) STRICT;
CREATE TABLE kv (
  namespace TEXT NOT NULL, key TEXT NOT NULL, value_json TEXT NOT NULL, policy TEXT NOT NULL, scope TEXT NOT NULL, updated_at TEXT NOT NULL,
  PRIMARY KEY (namespace, key)
) STRICT;
CREATE TABLE records (
  entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, environment_id TEXT NOT NULL, scope TEXT NOT NULL, schema_version INTEGER NOT NULL,
  local_revision INTEGER NOT NULL, hub_revision INTEGER, payload_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  PRIMARY KEY (entity_type, entity_id)
) STRICT;
CREATE TABLE outbox (
  op_id TEXT PRIMARY KEY, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, environment_id TEXT NOT NULL, device_id TEXT NOT NULL,
  op_kind TEXT NOT NULL, schema_version INTEGER NOT NULL, based_on_revision INTEGER, local_revision INTEGER NOT NULL, payload_json TEXT,
  status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE (entity_type, entity_id)
) STRICT;
CREATE TABLE history_entries (
  id TEXT PRIMARY KEY, tool_id TEXT NOT NULL, created_at INTEGER NOT NULL, size_bytes INTEGER NOT NULL, payload_json TEXT NOT NULL
) STRICT;
CREATE INDEX history_entries_tool_created ON history_entries (tool_id, created_at);
CREATE INDEX history_entries_created ON history_entries (created_at);
CREATE TABLE network_runs (
  id TEXT PRIMARY KEY, created_at INTEGER NOT NULL, size_bytes INTEGER NOT NULL, payload_json TEXT NOT NULL
) STRICT;
CREATE INDEX network_runs_created ON network_runs (created_at);
CREATE TABLE mutation_journal (
  engine TEXT NOT NULL, plan_id TEXT NOT NULL, applied_at INTEGER NOT NULL, entry_json TEXT NOT NULL,
  PRIMARY KEY (engine, plan_id)
) STRICT;
CREATE INDEX mutation_journal_engine_applied ON mutation_journal (engine, applied_at);
CREATE TABLE snapshot_headers (
  kind TEXT NOT NULL, id TEXT NOT NULL, created_at INTEGER NOT NULL, header_json TEXT NOT NULL,
  PRIMARY KEY (kind, id)
) STRICT;
CREATE TABLE powershell_history (id TEXT PRIMARY KEY, created_at INTEGER NOT NULL, entry_json TEXT NOT NULL) STRICT;
CREATE TABLE device_docs (name TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_at TEXT NOT NULL) STRICT;
CREATE TABLE secret_refs (
  ref TEXT PRIMARY KEY, purpose TEXT NOT NULL UNIQUE, owner TEXT NOT NULL, scope TEXT NOT NULL, created_at TEXT NOT NULL,
  last_used_at TEXT, needs_reentry INTEGER NOT NULL DEFAULT 0
) STRICT;
CREATE TABLE secret_values (
  ref TEXT PRIMARY KEY REFERENCES secret_refs(ref) ON DELETE CASCADE, ciphertext BLOB NOT NULL
) STRICT;
`,
};
