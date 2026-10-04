import type { Migration } from '@dude/sqlite-store';

/**
 * Phase 31F automatic temporary IP blocks. `ip_blocks` holds one row per blocked client address: the strike count (which
 * escalates the block duration), when the current block ends, and why it was applied. Failure and flood counters reuse the
 * existing `throttle` table. Additive, so minReaderVersion stays 1.
 */
export const migration0006: Migration = {
  version: 6,
  name: 'ip-blocks',
  minReaderVersion: 1,
  sql: `
CREATE TABLE ip_blocks (
  ip TEXT PRIMARY KEY, strikes INTEGER NOT NULL, blocked_until TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('credential-failures', 'flood')), updated_at TEXT NOT NULL
) STRICT;
`,
};
