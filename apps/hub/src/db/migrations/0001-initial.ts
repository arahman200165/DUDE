import type { Migration } from '@dude/sqlite-store';

/** Hub schema v1. Timestamps are ISO-8601 TEXT, booleans INTEGER 0/1. Never edit once shipped. */
export const migration0001: Migration = {
  version: 1,
  name: 'initial',
  minReaderVersion: 1,
  sql: `
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, checksum TEXT NOT NULL, applied_at TEXT NOT NULL) STRICT;
CREATE TABLE environment (
  environment_id TEXT PRIMARY KEY, display_name TEXT NOT NULL, created_at TEXT NOT NULL
) STRICT;
CREATE TABLE owner (
  owner_id TEXT PRIMARY KEY, environment_id TEXT NOT NULL REFERENCES environment(environment_id), display_name TEXT NOT NULL,
  created_at TEXT NOT NULL, password_changed_at TEXT
) STRICT;
CREATE TABLE owner_credentials (
  owner_id TEXT PRIMARY KEY REFERENCES owner(owner_id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind = 'password'), algorithm TEXT NOT NULL CHECK (algorithm = 'argon2id'),
  params_json TEXT NOT NULL, salt BLOB NOT NULL, hash BLOB NOT NULL, updated_at TEXT NOT NULL
) STRICT;
CREATE TABLE recovery_codes (
  code_hash TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES owner(owner_id) ON DELETE CASCADE,
  generation INTEGER NOT NULL, created_at TEXT NOT NULL, used_at TEXT
) STRICT;
CREATE INDEX recovery_codes_owner ON recovery_codes (owner_id, generation);
CREATE TABLE sessions (
  session_hash TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES owner(owner_id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('cookie', 'bearer')), device_id TEXT, csrf_hash TEXT,
  created_at TEXT NOT NULL, last_active_at TEXT NOT NULL, idle_expires_at TEXT NOT NULL, absolute_expires_at TEXT NOT NULL,
  revoked_at TEXT, user_agent TEXT, ip TEXT
) STRICT;
CREATE INDEX sessions_owner ON sessions (owner_id);
CREATE TABLE devices (
  device_id TEXT PRIMARY KEY, environment_id TEXT NOT NULL REFERENCES environment(environment_id), display_name TEXT NOT NULL,
  platform TEXT NOT NULL, app_version TEXT NOT NULL, capabilities_json TEXT NOT NULL,
  hub_eligible INTEGER NOT NULL CHECK (hub_eligible IN (0, 1)), protocol_version INTEGER NOT NULL,
  registered_at TEXT NOT NULL, last_seen_at TEXT, revoked_at TEXT, unenrolled_at TEXT,
  recovery_trusted INTEGER NOT NULL DEFAULT 0 CHECK (recovery_trusted IN (0, 1))
) STRICT;
CREATE INDEX devices_environment ON devices (environment_id);
CREATE TABLE device_keys (
  key_id TEXT PRIMARY KEY, device_id TEXT NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
  algorithm TEXT NOT NULL CHECK (algorithm = 'ed25519'), public_key BLOB NOT NULL, created_at TEXT NOT NULL, revoked_at TEXT
) STRICT;
CREATE INDEX device_keys_device ON device_keys (device_id);
CREATE TABLE device_tokens (
  token_hash TEXT PRIMARY KEY, device_id TEXT NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
  key_id TEXT NOT NULL REFERENCES device_keys(key_id), issued_at TEXT NOT NULL, expires_at TEXT NOT NULL, revoked_at TEXT
) STRICT;
CREATE INDEX device_tokens_device ON device_tokens (device_id);
CREATE TABLE challenges (
  nonce TEXT PRIMARY KEY, purpose TEXT NOT NULL, device_id TEXT, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, consumed_at TEXT
) STRICT;
CREATE INDEX challenges_expires ON challenges (expires_at);
CREATE TABLE pairing_codes (
  code_hash TEXT PRIMARY KEY, created_by_session_hash TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0, consumed_at TEXT, consumed_by_device_id TEXT
) STRICT;
CREATE TABLE setup_state (
  id INTEGER PRIMARY KEY CHECK (id = 1), token_hash TEXT NOT NULL, created_at TEXT NOT NULL, consumed_at TEXT
) STRICT;
CREATE TABLE throttle (
  throttle_key TEXT PRIMARY KEY, failures INTEGER NOT NULL, window_started_at TEXT NOT NULL, next_allowed_at TEXT
) STRICT;
CREATE TABLE audit_events (
  seq INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, actor_kind TEXT NOT NULL, actor_id TEXT, event TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('success', 'failure', 'denied')), ip TEXT, detail_json TEXT
) STRICT;
CREATE INDEX audit_events_at ON audit_events (at);
CREATE TABLE tls_pins (
  spki_sha256 TEXT PRIMARY KEY, cert_pem TEXT NOT NULL, key_ref TEXT,
  state TEXT NOT NULL CHECK (state IN ('active', 'next', 'retired')), created_at TEXT NOT NULL, activated_at TEXT
) STRICT;
CREATE TABLE tls_pin_acks (
  spki_sha256 TEXT NOT NULL REFERENCES tls_pins(spki_sha256) ON DELETE CASCADE,
  device_id TEXT NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE, acked_at TEXT NOT NULL,
  PRIMARY KEY (spki_sha256, device_id)
) STRICT;
CREATE TABLE records (
  environment_id TEXT NOT NULL REFERENCES environment(environment_id), entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
  scope TEXT NOT NULL, schema_version INTEGER NOT NULL, revision INTEGER NOT NULL, payload_json TEXT,
  deleted INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1)), updated_at TEXT NOT NULL, updated_by_device_id TEXT,
  PRIMARY KEY (environment_id, entity_type, entity_id)
) STRICT;
CREATE TABLE change_feed (
  revision INTEGER PRIMARY KEY, environment_id TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
  op TEXT NOT NULL CHECK (op IN ('upsert', 'delete')), device_id TEXT, op_id TEXT, at TEXT NOT NULL
) STRICT;
CREATE INDEX change_feed_environment ON change_feed (environment_id, revision);
CREATE TABLE applied_ops (
  op_id TEXT PRIMARY KEY, revision INTEGER NOT NULL, device_id TEXT, applied_at TEXT NOT NULL
) STRICT;
`,
};
