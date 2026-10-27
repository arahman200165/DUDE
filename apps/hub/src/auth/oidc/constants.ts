/**
 * OIDC sign-in constants (32-SS1, Milestone 841, PD-121, PD-145). The authorization-code flow with PKCE (S256) runs against the
 * owner's own OAuth client; the Hub holds no password-equivalent for Google and binds identity by `sub` only.
 */

/** The one route a provider may redirect a browser to from another site (see `security/cross-site-get.ts`). Session-less (M842). */
export const OIDC_CALLBACK_PATH = '/api/v1/auth/oidc/callback';

/** The provider key stored in `linked_identities.provider` (the only one today). */
export const OIDC_PROVIDER = 'google';

/** The scope requested. `email` is display text only: identity binds by `sub` and never by an address. */
export const OIDC_SCOPE = 'openid email';

/** A flow is valid this long from the authorization request (the owner may need to pick an account and approve). */
export const OIDC_FLOW_TTL_MS = 10 * 60_000;
/** The verified link's one-time completion token is valid this long after the callback (the owner may need to re-confirm the password). */
export const OIDC_LINK_TTL_MS = 10 * 60_000;
/** A consumed or expired flow row is kept this long so a replay is told apart from an unknown state, then swept (and so a verified link outlives its completion token). */
export const OIDC_FLOW_RETAIN_MS = 20 * 60_000;
/** At most this many unexpired, unconsumed flows exist at once; `signin` starts are unauthenticated, so the table is bounded. */
export const OIDC_MAX_ACTIVE_FLOWS = 200;

/** Allowed clock skew when checking `exp`, `nbf` and `iat` of an ID token. */
export const OIDC_CLOCK_SKEW_SECONDS = 60;
/** An ID token must have been issued at most this long ago: the Hub exchanges the code seconds after the redirect. */
export const OIDC_MAX_TOKEN_AGE_SECONDS = 10 * 60;
/** The only signature algorithm accepted (Google signs ID tokens with RS256). */
export const OIDC_ALLOWED_ALGORITHMS = ['RS256'] as const;

/** Outbound HTTP bounds for discovery, JWKS and the token exchange. */
export const OIDC_FETCH_TIMEOUT_MS = 5_000;
export const OIDC_DISCOVERY_MAX_BYTES = 64 * 1024;
export const OIDC_JWKS_MAX_BYTES = 128 * 1024;
export const OIDC_TOKEN_MAX_BYTES = 64 * 1024;
export const OIDC_JWKS_MAX_KEYS = 20;
export const OIDC_MAX_REDIRECTS = 2;

/** How long the discovery document and the JWKS are cached when the provider's `Cache-Control` does not say (clamped either way). */
export const OIDC_CACHE_DEFAULT_MS = 60 * 60_000;
export const OIDC_CACHE_MIN_MS = 5 * 60_000;
export const OIDC_CACHE_MAX_MS = 24 * 60 * 60_000;
/** A stale cached copy may serve while the provider is unreachable, up to this age. */
export const OIDC_CACHE_STALE_MAX_MS = 24 * 60 * 60_000;
/** After a failed fetch the failure itself is remembered this long, so an outage does not make every sign-in wait for a timeout. */
export const OIDC_FAILURE_BACKOFF_MS = 30_000;
/** An unknown `kid` forces one JWKS refresh, but never more often than this (a forged `kid` must not turn into a fetch per request). */
export const OIDC_JWKS_REFRESH_COOLDOWN_MS = 30_000;

/** The hosts the Google issuer's discovery, JWKS, token and userinfo endpoints live on. */
export const GOOGLE_ISSUER = 'https://accounts.google.com';
export const GOOGLE_EGRESS_HOSTS = ['accounts.google.com', 'oauth2.googleapis.com', 'www.googleapis.com'] as const;

/** `return_to` limits. */
export const OIDC_RETURN_TO_MAX = 512;
export const OIDC_DEFAULT_RETURN_TO = '/';
