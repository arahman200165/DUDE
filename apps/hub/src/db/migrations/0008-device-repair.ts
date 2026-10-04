import type { Migration } from '@dude/sqlite-store';

/**
 * Phase 31G Hub restore (PD-072). `devices.needs_re_pair` marks a device whose key was revoked by a restore: the owner re-pairs it
 * through a pairing code created for that row (`pairing_codes.reattach_device_id`), so the new key attaches to the old row and its
 * history is kept. Both columns are additive and default to "not set", so minReaderVersion stays 1.
 */
export const migration0008: Migration = {
  version: 8,
  name: 'device-repair',
  minReaderVersion: 1,
  sql: `
ALTER TABLE devices ADD COLUMN needs_re_pair INTEGER NOT NULL DEFAULT 0 CHECK (needs_re_pair IN (0, 1));
ALTER TABLE pairing_codes ADD COLUMN reattach_device_id TEXT;
`,
};
