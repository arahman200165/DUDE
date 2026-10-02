import type { Migration } from '@dude/sqlite-store';

/** Lets the single `setup_state` row carry either the first-run setup token or a local owner-reset token. */
export const migration0002: Migration = {
  version: 2,
  name: 'owner-reset',
  minReaderVersion: 1,
  sql: `
ALTER TABLE setup_state ADD COLUMN purpose TEXT NOT NULL DEFAULT 'bootstrap' CHECK (purpose IN ('bootstrap', 'owner-reset'));
`,
};
