import type { Migration } from '@dude/sqlite-store';

/**
 * Phase 31F owner step-up and session rotation. `sessions.stepped_up_at` is when a cookie session last proved the owner
 * password (sign-in, recovery, step-up); `sessions.rotated_to` names the successor session hash after a rotation, so the
 * predecessor can finish its short grace period without being revoked. Additive, so minReaderVersion stays 1.
 */
export const migration0007: Migration = {
  version: 7,
  name: 'session-step-up',
  minReaderVersion: 1,
  sql: `
ALTER TABLE sessions ADD COLUMN stepped_up_at TEXT;
ALTER TABLE sessions ADD COLUMN rotated_to TEXT;
`,
};
