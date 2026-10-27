import type { Migration } from '@dude/sqlite-store';

/**
 * 32-SS1 OIDC sign-in (Milestone 841, PD-145). `linked_identities` binds the owner to external identities by the provider's stable
 * subject (`sub`) ONLY: `email` is display text and is never consulted for identity. One (provider, sub) pair belongs to exactly one
 * row. `oidc_flows` is transient: one row per authorization request, holding only hashes of `state` and `nonce` plus the PKCE verifier
 * (the one value the Hub needs again at the token exchange; it is cleared the moment the flow is consumed, expires in minutes and the
 * table is scrubbed from every backup). A `link` flow is bound to the signed-in owner and session; a `signin` flow to nobody.
 * Additive, so the reader floor stays where earlier migrations left it.
 */
export const migration0011: Migration = {
  version: 11,
  name: 'oidc',
  minReaderVersion: 1,
  sql: `
CREATE TABLE linked_identities (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES owner(owner_id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider = 'google'),
  sub TEXT NOT NULL CHECK (length(sub) BETWEEN 1 AND 255),
  email TEXT,
  issuer TEXT NOT NULL,
  linked_at TEXT NOT NULL,
  last_used_at TEXT,
  UNIQUE (provider, sub)
) STRICT;
CREATE INDEX linked_identities_owner ON linked_identities (owner_id);
CREATE TABLE oidc_flows (
  state_hash TEXT PRIMARY KEY,
  nonce_hash TEXT NOT NULL,
  code_verifier TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('signin', 'link')),
  owner_id TEXT REFERENCES owner(owner_id) ON DELETE CASCADE,
  session_hash TEXT,
  return_to TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  CHECK ((purpose = 'link' AND owner_id IS NOT NULL AND session_hash IS NOT NULL) OR (purpose = 'signin' AND owner_id IS NULL AND session_hash IS NULL))
) STRICT;
CREATE INDEX oidc_flows_expires ON oidc_flows (expires_at);
`,
};
