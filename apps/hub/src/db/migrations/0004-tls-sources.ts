import type { Migration } from '@dude/sqlite-store';

/**
 * Phase 31E certificate sources. `tls_pins.source` records where a pinned leaf came from (`imported` cannot be derived from
 * the files; `local-ca` is still derived from the issuer at read time, so existing rows keep the default). `tls_proxy_pins`
 * is a separate pin set for reverse-proxy leaves (at most one active and one next), with its own device acknowledgements.
 * Additive, so minReaderVersion stays 1.
 */
export const migration0004: Migration = {
  version: 4,
  name: 'tls-sources',
  minReaderVersion: 1,
  sql: `
ALTER TABLE tls_pins ADD COLUMN source TEXT NOT NULL DEFAULT 'self-signed';
CREATE TABLE tls_proxy_pins (
  spki_sha256 TEXT PRIMARY KEY, state TEXT NOT NULL CHECK (state IN ('active', 'next')), cert_pem TEXT,
  created_at TEXT NOT NULL, activated_at TEXT
) STRICT;
CREATE UNIQUE INDEX tls_proxy_pins_state ON tls_proxy_pins (state);
CREATE TABLE tls_proxy_pin_acks (
  spki_sha256 TEXT NOT NULL REFERENCES tls_proxy_pins(spki_sha256) ON DELETE CASCADE,
  device_id TEXT NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE, acked_at TEXT NOT NULL,
  PRIMARY KEY (spki_sha256, device_id)
) STRICT;
`,
};
