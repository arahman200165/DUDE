import Type, { type Static } from 'typebox';

/**
 * The token-only ingest scaffold (32-SS1, Milestone 843, PD-119, PD-149). SS3 builds the real capture routes on it.
 *
 * Credential types, route by route:
 * - `GET  /api/v1/ingest/ping`                           ingest token (`Authorization: Bearer dit_...`) ONLY. Cookies, owner bearer sessions
 *                                                        and device tokens are refused (401); an ingest token is refused on every other route (401).
 * - `GET  /api/v1/admin/ingest-tokens`                   owner cookie or bearer session: the tokens (never a secret or a hash).
 * - `POST /api/v1/admin/ingest-tokens`                   owner cookie or bearer session plus step-up: mints a token; the secret is in this response ONLY.
 * - `POST /api/v1/admin/ingest-tokens/:id/revoke/preview` and `.../revoke`  owner plus step-up, two-step with the server-side ConfirmationStore.
 *
 * `/api/v1/ingest/*` is the TOKEN-ONLY namespace: the owner's management routes therefore live under `/api/v1/admin/ingest-tokens`.
 * An ingest token never grants owner access, never satisfies step-up and never reaches the vault. Scopes are a CLOSED list: Milestone 843 needs
 * exactly one; 32-SS3 adds the capture scopes beside it (a token minted before then never gains one).
 */
export const INGEST_PATH_PREFIX = '/api/v1/ingest/';
export const INGEST_TOKEN_PREFIX = 'dit_';
/** `dit_` plus 43 base64url characters (32 random bytes). */
export const INGEST_TOKEN_PATTERN = /^dit_[A-Za-z0-9_-]{43}$/;

export const HUB_INGEST_PATHS = {
  ping: '/api/v1/ingest/ping',
  tokens: '/api/v1/admin/ingest-tokens',
} as const;
export const ingestRevokePreviewPath = (id: string): string => `${HUB_INGEST_PATHS.tokens}/${encodeURIComponent(id)}/revoke/preview`;
export const ingestRevokePath = (id: string): string => `${HUB_INGEST_PATHS.tokens}/${encodeURIComponent(id)}/revoke`;

/** The closed scope list. 32-SS3 appends the capture scopes; nothing else may widen it. */
export const INGEST_SCOPES = ['ingest:ping'] as const;
export type IngestScope = (typeof INGEST_SCOPES)[number];
export function isIngestScope(value: string): value is IngestScope {
  return (INGEST_SCOPES as readonly string[]).includes(value);
}

export const INGEST_LABEL_MAX = 64;
export const INGEST_MAX_EXPIRY_DAYS = 365;
/** Tokens that are not revoked (expired ones count until revoked), so the list stays reviewable. */
export const INGEST_MAX_LIVE_TOKENS = 25;

/** The confirmation action of a revoke (single-use token bound to the token id) and its consequence class tags. */
export const INGEST_REVOKE_ACTION = 'ingest.token-revoke';
export const INGEST_REVOKE_CONSEQUENCE_CLASS = ['secret-management'] as const;

export const IngestScopeSchema = Type.Unsafe<IngestScope>({ type: 'string', enum: [...INGEST_SCOPES] });

export const IngestTokenCreateRequest = Type.Object(
  {
    label: Type.String({ minLength: 1, maxLength: INGEST_LABEL_MAX }),
    scopes: Type.Array(IngestScopeSchema, { minItems: 1, maxItems: INGEST_SCOPES.length, uniqueItems: true }),
    expiresInDays: Type.Optional(Type.Integer({ minimum: 1, maximum: INGEST_MAX_EXPIRY_DAYS })),
  },
  { additionalProperties: false },
);
export type IngestTokenCreateRequest = Static<typeof IngestTokenCreateRequest>;

export const INGEST_TOKEN_STATES = ['active', 'expired', 'revoked'] as const;
export type IngestTokenState = (typeof INGEST_TOKEN_STATES)[number];

/** A token as the owner sees it: never the secret, never the hash. `prefix` is the first characters, display only. */
export const IngestTokenInfo = Type.Object({
  id: Type.String(),
  label: Type.String(),
  prefix: Type.String(),
  scopes: Type.Array(IngestScopeSchema),
  state: Type.Unsafe<IngestTokenState>({ type: 'string', enum: [...INGEST_TOKEN_STATES] }),
  createdAt: Type.String(),
  lastUsedAt: Type.Union([Type.String(), Type.Null()]),
  expiresAt: Type.Union([Type.String(), Type.Null()]),
  revokedAt: Type.Union([Type.String(), Type.Null()]),
});
export type IngestTokenInfo = Static<typeof IngestTokenInfo>;

export const IngestTokenListResponse = Type.Object({ tokens: Type.Array(IngestTokenInfo) });
export type IngestTokenListResponse = Static<typeof IngestTokenListResponse>;

/** The one response that carries a secret. It is shown exactly once and is not recoverable. */
export const IngestTokenCreateResponse = Type.Object({ token: IngestTokenInfo, secret: Type.String({ pattern: '^dit_[A-Za-z0-9_-]{43}$' }) });
export type IngestTokenCreateResponse = Static<typeof IngestTokenCreateResponse>;

export const IngestTokenRevokePreview = Type.Object({
  confirmToken: Type.String(),
  expiresAt: Type.String(),
  consequenceClass: Type.Array(Type.String()),
  summary: Type.Object({ action: Type.String(), id: Type.String(), label: Type.String(), prefix: Type.String() }),
});
export type IngestTokenRevokePreview = Static<typeof IngestTokenRevokePreview>;

export const IngestTokenRevokeRequest = Type.Object({ confirmToken: Type.String({ minLength: 1, maxLength: 256 }) }, { additionalProperties: false });
export type IngestTokenRevokeRequest = Static<typeof IngestTokenRevokeRequest>;

export const IngestPingResponse = Type.Object({
  ok: Type.Literal(true),
  tokenId: Type.String(),
  scopes: Type.Array(IngestScopeSchema),
  serverTime: Type.String(),
});
export type IngestPingResponse = Static<typeof IngestPingResponse>;
