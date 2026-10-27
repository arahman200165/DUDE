import type { Migration } from '@dude/sqlite-store';

/**
 * SaveSphere content store schema v4 (32-SS1, Milestone 843, PD-119, PD-149): the ingest token scaffold. `ingest_tokens` is credential
 * state of the SaveSphere platform, not content: it lives here (not in `dude.db`) because the capture API it authenticates is SaveSphere's,
 * and backups scrub it (`SAVESPHERE_SCRUBBED_TABLES`), so a restored Hub never carries a capture credential from before the restore and the
 * owner mints new ones (PD-149). `token_hash` is the lower-case hex SHA-256 of the whole `dit_...` secret (32 random bytes, so a plain hash
 * is enough and a lookup by hash is exact); the secret is never stored and is shown once at creation. `prefix` is the first characters of
 * the secret, display only. `scopes_json` is a JSON array of the CLOSED `INGEST_SCOPES` list. Times are integer epoch milliseconds like
 * `jobs`. `last_used_at` is updated at most once a minute. `created_by` is the owner id. Never edit once shipped.
 */
export const saveSphereMigration0004: Migration = {
  version: 4,
  name: 'ingest-tokens',
  minReaderVersion: 4,
  sql: `
CREATE TABLE ingest_tokens (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL CHECK (length(label) BETWEEN 1 AND 64),
  token_hash TEXT NOT NULL UNIQUE CHECK (length(token_hash) = 64),
  prefix TEXT NOT NULL,
  scopes_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER,
  expires_at INTEGER,
  revoked_at INTEGER,
  created_by TEXT NOT NULL
) STRICT;
CREATE INDEX idx_ingest_tokens_live ON ingest_tokens(created_at) WHERE revoked_at IS NULL;
`,
};
