import Type, { type Static } from 'typebox';

/**
 * Google (OIDC) sign-in, linking and unlinking (32-SS1, Milestone 842, PD-121, PD-145).
 *
 * Credential types, route by route:
 * - `GET  /auth/oidc/status`        none: only `{ enabled, configured }`, so the sign-in page knows whether to offer Google.
 * - `POST /auth/oidc/start`         none (rate limited, never reveals whether any account exists): the authorization URL of a sign-in flow.
 * - `GET  /auth/oidc/callback`      none and session-less (`security/cross-site-get.ts` removes every credential header before the
 *                                   handler runs): spends the flow, verifies the ID token and answers a same-site redirect, never JSON.
 * - `POST /auth/oidc/link/start`    owner cookie session plus step-up: the authorization URL of a link flow bound to that session.
 * - `POST /auth/oidc/link/complete` owner cookie session plus step-up: the second leg; the signed-in owner binds the verified `sub`.
 * - `GET  /auth/oidc/accounts`      owner cookie or bearer session: the linked accounts.
 * - `POST /auth/oidc/unlink/preview` and `POST /auth/oidc/unlink`  owner cookie or bearer session plus step-up, two-step with the
 *                                   server-side ConfirmationStore.
 *
 * Identity binds by the provider's `sub` ONLY and never by an address; `email` is display text. Step-up is the owner password (or a
 * recovery code) and never Google. Password and recovery sign-in are never affected by any of this.
 */
export const HUB_OIDC_PATHS = {
  status: '/api/v1/auth/oidc/status',
  start: '/api/v1/auth/oidc/start',
  callback: '/api/v1/auth/oidc/callback',
  linkStart: '/api/v1/auth/oidc/link/start',
  linkComplete: '/api/v1/auth/oidc/link/complete',
  accounts: '/api/v1/auth/oidc/accounts',
  unlinkPreview: '/api/v1/auth/oidc/unlink/preview',
  unlink: '/api/v1/auth/oidc/unlink',
} as const;

/** The confirmation action of an unlink (single-use token bound to the account id) and its consequence class tags. */
export const OIDC_UNLINK_ACTION = 'oidc.unlink';
export const OIDC_UNLINK_CONSEQUENCE_CLASS = ['secret-management'] as const;

/**
 * The only outcomes the callback puts in a redirect, so a probe learns nothing more than "it did not work".
 * `?oidc=` on `/hub/sign-in`: `failed` (every refusal: an unlinked account, a bad, replayed or expired state, a rejected code, a bad token),
 * `unavailable` (Google, the client secret or the configuration cannot serve a sign-in; the password still works) and `locked` (too many
 * failed attempts from this address). `?oidcLink=` on the link flow's return path carries either the single-use completion token or
 * `failed` / `unavailable`.
 */
export const OIDC_SIGN_IN_RESULTS = ['failed', 'unavailable', 'locked'] as const;
export type OidcSignInResult = (typeof OIDC_SIGN_IN_RESULTS)[number];
export const OIDC_LINK_FAILURES = ['failed', 'unavailable'] as const;
export const HUB_OIDC_SIGN_IN_PAGE = '/hub/sign-in';
export const HUB_OIDC_SIGN_IN_QUERY = 'oidc';
export const HUB_OIDC_LINK_QUERY = 'oidcLink';

/** `configured`: the Hub has an `oidc` block. `enabled`: Google sign-in can be offered (configured, with the client secret stored). Offline, never a probe of Google. */
export const OidcStatusResponse = Type.Object({ enabled: Type.Boolean(), configured: Type.Boolean() });
export type OidcStatusResponse = Static<typeof OidcStatusResponse>;

/** A same-site path (the server falls back silently to `/` for anything else). */
export const OidcStartRequest = Type.Object({ returnTo: Type.Optional(Type.String({ maxLength: 512 })) }, { additionalProperties: false });
export type OidcStartRequest = Static<typeof OidcStartRequest>;

export const OidcStartResponse = Type.Object({ authorizationUrl: Type.String(), expiresAt: Type.String() });
export type OidcStartResponse = Static<typeof OidcStartResponse>;

/** The one-time handle the callback adds to the link flow's return path (43 base64url characters). */
export const OidcLinkCompleteRequest = Type.Object({ linkToken: Type.String({ pattern: '^[A-Za-z0-9_-]{43}$' }) }, { additionalProperties: false });
export type OidcLinkCompleteRequest = Static<typeof OidcLinkCompleteRequest>;

export const OidcAccount = Type.Object({
  id: Type.String(),
  provider: Type.Literal('google'),
  /** Display text only: identity is the provider's `sub`, which is never returned. */
  email: Type.Union([Type.String(), Type.Null()]),
  linkedAt: Type.String(),
  lastUsedAt: Type.Union([Type.String(), Type.Null()]),
});
export type OidcAccount = Static<typeof OidcAccount>;

export const OidcLinkCompleteResponse = Type.Object({ account: OidcAccount });
export type OidcLinkCompleteResponse = Static<typeof OidcLinkCompleteResponse>;

export const OidcAccountsResponse = Type.Object({ accounts: Type.Array(OidcAccount) });
export type OidcAccountsResponse = Static<typeof OidcAccountsResponse>;

export const OidcUnlinkPreviewRequest = Type.Object({ accountId: Type.String({ minLength: 1, maxLength: 64 }) }, { additionalProperties: false });
export type OidcUnlinkPreviewRequest = Static<typeof OidcUnlinkPreviewRequest>;

export const OidcUnlinkPreview = Type.Object({
  confirmToken: Type.String(),
  expiresAt: Type.String(),
  consequenceClass: Type.Array(Type.String()),
  summary: Type.Object({ action: Type.String(), accountId: Type.String(), email: Type.Union([Type.String(), Type.Null()]), remainingAccounts: Type.Integer({ minimum: 0 }) }),
});
export type OidcUnlinkPreview = Static<typeof OidcUnlinkPreview>;

export const OidcUnlinkRequest = Type.Object(
  { accountId: Type.String({ minLength: 1, maxLength: 64 }), confirmToken: Type.String({ minLength: 1, maxLength: 256 }) },
  { additionalProperties: false },
);
export type OidcUnlinkRequest = Static<typeof OidcUnlinkRequest>;
