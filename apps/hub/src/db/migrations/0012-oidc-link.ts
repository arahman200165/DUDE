import type { Migration } from '@dude/sqlite-store';

/**
 * 32-SS1 OIDC linking (Milestone 842, PD-145). A link flow's callback is cross-site and credential-less, so it cannot bind the Google
 * account to the owner itself: it records the VERIFIED provider subject on the (already consumed) flow row and hands the browser a
 * one-time completion token, and the signed-in owner's session completes the link on a same-site request. `link_token_hash` is the
 * SHA-256 of that token (the raw value only exists in the redirect), `link_expires_at` bounds it and `link_completed_at` makes it
 * single use. These columns live on the transient `oidc_flows` table, which is scrubbed from every backup (PD-145). Additive, so the
 * reader floor stays where earlier migrations left it.
 */
export const migration0012: Migration = {
  version: 12,
  name: 'oidc-link',
  minReaderVersion: 1,
  sql: `
ALTER TABLE oidc_flows ADD COLUMN verified_sub TEXT CHECK (verified_sub IS NULL OR length(verified_sub) BETWEEN 1 AND 255);
ALTER TABLE oidc_flows ADD COLUMN verified_email TEXT;
ALTER TABLE oidc_flows ADD COLUMN verified_issuer TEXT;
ALTER TABLE oidc_flows ADD COLUMN link_token_hash TEXT;
ALTER TABLE oidc_flows ADD COLUMN link_expires_at TEXT;
ALTER TABLE oidc_flows ADD COLUMN link_completed_at TEXT;
CREATE UNIQUE INDEX oidc_flows_link_token ON oidc_flows (link_token_hash) WHERE link_token_hash IS NOT NULL;
`,
};
