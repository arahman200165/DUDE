/**
 * The closed list of credential types a Hub route can declare (every route names exactly the ones it accepts). `ingest-token` (`dit_`,
 * 32-SS1 Milestone 843, PD-119) is accepted ONLY by routes under `/api/v1/ingest/` and by no other route; the other bearer families are
 * the owner session (`dob_`) and the device token (`ddt_`). The sign-in gate's allowlist (`apps/hub/src/security/route-gating-allowlist.ts`)
 * is expressed in these terms.
 */
export const HUB_CREDENTIAL_TYPES = ['none', 'setup-token', 'owner-cookie', 'owner-bearer', 'device-token', 'ingest-token'] as const;
export type HubCredentialType = (typeof HUB_CREDENTIAL_TYPES)[number];

/** The bearer token prefixes, one per family. Every prefix is distinct and no prefix is a prefix of another. */
export const HUB_BEARER_PREFIXES = { 'owner-bearer': 'dob_', 'device-token': 'ddt_', 'ingest-token': 'dit_' } as const;
