import type { Migration } from '@dude/sqlite-store';

/**
 * SaveSphere content store schema v3 (32-SS1, Milestone 834, PD-147): the durable job queue. `jobs` is operational state, not
 * content: backups scrub it (`SAVESPHERE_SCRUBBED_TABLES`) and a restored Hub re-derives pending work from content state.
 * Times are integer epoch milliseconds (they are compared and added to, never shown raw). `state`: `queued` waits (a failed
 * attempt returns here with a later `run_after`), `running` holds a lease (`lease_owner`, `lease_expires_at`), `succeeded`, `failed`
 * (permanent, no retry) and `dead` (every attempt used) are terminal. `attempts` counts claims, so a worker that dies mid-job has
 * already used one. `payload_json` never holds a secret (enqueue refuses secret-looking keys); `last_error` is redacted and
 * truncated before it is stored; `result_json` is a small summary. `idempotency_key` is unique among ACTIVE jobs only (queued or
 * running), so a scheduled job that is still waiting is never queued twice while a finished one can run again. Never edit once shipped.
 */
export const saveSphereMigration0003: Migration = {
  version: 3,
  name: 'queue',
  minReaderVersion: 3,
  sql: `
CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  idempotency_key TEXT,
  state TEXT NOT NULL DEFAULT 'queued' CHECK (state IN ('queued', 'running', 'succeeded', 'failed', 'dead')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 5 CHECK (max_attempts >= 1),
  priority INTEGER NOT NULL DEFAULT 0,
  run_after INTEGER NOT NULL,
  lease_owner TEXT,
  lease_expires_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  finished_at INTEGER,
  last_error TEXT,
  result_json TEXT
) STRICT;
CREATE INDEX idx_jobs_claim ON jobs(priority DESC, run_after) WHERE state = 'queued';
CREATE INDEX idx_jobs_lease ON jobs(lease_expires_at) WHERE state = 'running';
CREATE INDEX idx_jobs_finished ON jobs(finished_at) WHERE finished_at IS NOT NULL;
CREATE INDEX idx_jobs_kind_state ON jobs(kind, state);
CREATE UNIQUE INDEX idx_jobs_idempotency ON jobs(idempotency_key) WHERE idempotency_key IS NOT NULL AND state IN ('queued', 'running');
`,
};
