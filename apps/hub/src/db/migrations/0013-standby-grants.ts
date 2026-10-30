import type { Migration } from '@dude/sqlite-store';

/**
 * 32-SS1 warm standby (Milestone 849, PD-151). `standby_grants` holds the owner's per-device standby grant: a row means the desktop device
 * may PULL the encrypted backup repository objects over the device-token standby routes. Set and removed only on the elevated admin pipe
 * (two-step, audited `standby.granted` / `standby.revoked`); a revoke deletes the row. `device_registered_at` pins the grant to the
 * enrollment it was given to: a device that is re-enrolled or re-attached gets a new `registered_at`, so an old grant never carries over to
 * a new key. The table is SCRUBBED from backups and cleared on restore (`backup/snapshot.ts`): a restored Hub is a new instance and the
 * owner grants again. A new table only, so the reader floor stays where earlier migrations left it.
 */
export const migration0013: Migration = {
  version: 13,
  name: 'standby-grants',
  minReaderVersion: 1,
  sql: `
CREATE TABLE standby_grants (
  device_id TEXT PRIMARY KEY REFERENCES devices(device_id),
  device_registered_at TEXT NOT NULL,
  granted_at TEXT NOT NULL
) STRICT;
`,
};
