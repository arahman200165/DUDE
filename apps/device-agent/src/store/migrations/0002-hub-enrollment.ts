import type { Migration } from './index.js';

/**
 * Hub enrollment (Phase 31C): one row describing this device's enrollment with a Hub, including the
 * DPAPI-wrapped Ed25519 device key. Additive only, so minReaderVersion stays 1: an older build can
 * still open the store, simply ignores this table and behaves as a standalone device. The standalone
 * `meta.environment_id` is untouched and local records keep it (31D re-keys).
 */
export const migration0002: Migration = {
  version: 2,
  name: 'hub-enrollment',
  minReaderVersion: 1,
  sql: `
CREATE TABLE hub_enrollment (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  state TEXT NOT NULL CHECK (state IN ('enrolled', 'revoked')),
  hub_instance_id TEXT NOT NULL,
  environment_id TEXT NOT NULL,
  hub_url TEXT NOT NULL,
  protocol_version INTEGER NOT NULL,
  spki_active TEXT NOT NULL,
  cert_active_pem TEXT NOT NULL,
  spki_next TEXT,
  cert_next_pem TEXT,
  key_id TEXT NOT NULL,
  public_key BLOB NOT NULL,
  wrapped_private_key BLOB NOT NULL,
  enrolled_at TEXT NOT NULL,
  last_contact_at TEXT,
  revoked_at TEXT,
  updated_at TEXT NOT NULL
) STRICT;
`,
};
