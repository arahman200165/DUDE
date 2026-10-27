import { createLocalJWKSet, decodeProtectedHeader, errors, jwtVerify } from 'jose';
import type { JWTPayload } from 'jose';
import { OIDC_ALLOWED_ALGORITHMS, OIDC_CLOCK_SKEW_SECONDS, OIDC_MAX_TOKEN_AGE_SECONDS } from './constants.js';
import { constantTimeEqual, sha256Hex } from './pkce.js';
import type { OidcProvider } from './provider.js';

/**
 * ID-token verification (32-SS1, Milestone 841, PD-145). `jose` checks the RS256 signature against the provider's JWKS and the
 * `iss`, `aud`, `exp` and `nbf` claims; this module adds what the OIDC core spec asks of a relying party and `jose` does not do by
 * itself: the `nonce` (constant-time, against the stored hash), `azp` for a multi-audience token, `iat` freshness, and a bounded `sub`.
 *
 * - The algorithm allowlist is `RS256` only: `none`, `HS256` (the classic key-confusion attack) and every other algorithm are refused
 *   before any key is looked up.
 * - A `kid` the cached JWKS does not know triggers ONE forced refresh (itself rate-limited by the provider's cooldown), then a refusal.
 * - `email` is display text and `email_verified` is informational only: identity is the `sub`, never an address.
 * - A failure is a closed reason. The token, its claims and the library's messages are never returned, logged or audited.
 */

export const ID_TOKEN_FAILURES = [
  'malformed', 'unsupported-alg', 'bad-signature', 'unknown-key', 'issuer', 'audience', 'authorized-party', 'expired', 'not-yet-valid', 'issued-at', 'nonce', 'subject', 'claims',
] as const;
export type IdTokenFailure = (typeof ID_TOKEN_FAILURES)[number];

export interface VerifiedIdentity {
  /** The provider's stable subject: the ONLY thing identity binds to. */
  sub: string;
  issuer: string;
  /** Display text only; never compared for identity. */
  email: string | undefined;
  /** Informational only. */
  emailVerified: boolean | undefined;
}

export type VerifyResult = { ok: true; identity: VerifiedIdentity } | { ok: false; reason: IdTokenFailure } | { ok: false; reason: 'unreachable' };

export interface VerifyIdTokenOptions {
  provider: OidcProvider;
  issuer: string;
  clientId: string;
  /** `sha256Hex` of the nonce this flow generated. */
  expectedNonceHash: string;
  now?: () => number;
}

/** A compact JWS this large is not an ID token from any provider the Hub talks to. */
const MAX_TOKEN_CHARS = 16 * 1024;
/** Three base64url segments; the signature may be empty only so that an unsecured (`alg: none`) token is refused for its algorithm. */
const COMPACT = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/;

type Attempt = { payload: JWTPayload } | { failure: IdTokenFailure };

function mapJoseError(error: unknown): IdTokenFailure {
  if (error instanceof errors.JWTExpired) return 'expired';
  if (error instanceof errors.JWTClaimValidationFailed) {
    switch (error.claim) {
      case 'iss': return 'issuer';
      case 'aud': return 'audience';
      case 'nbf': return 'not-yet-valid';
      case 'iat': return 'issued-at';
      case 'sub': return 'subject';
      default: return 'claims';
    }
  }
  if (error instanceof errors.JWSSignatureVerificationFailed) return 'bad-signature';
  if (error instanceof errors.JOSEAlgNotAllowed) return 'unsupported-alg';
  if (error instanceof errors.JWKSNoMatchingKey || error instanceof errors.JWKSMultipleMatchingKeys) return 'unknown-key';
  if (error instanceof errors.JWSInvalid || error instanceof errors.JWTInvalid) return 'malformed';
  return 'claims';
}

function cleanEmail(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return text.length > 0 && text.length <= 254 ? text : undefined;
}

function emailVerified(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

function checkPayload(payload: JWTPayload, options: VerifyIdTokenOptions, nowSeconds: number): VerifyResult {
  const { aud, azp, iat, sub, nonce } = payload as JWTPayload & { azp?: unknown };
  if (typeof iat !== 'number' || iat > nowSeconds + OIDC_CLOCK_SKEW_SECONDS || nowSeconds - iat > OIDC_MAX_TOKEN_AGE_SECONDS + OIDC_CLOCK_SKEW_SECONDS) return { ok: false, reason: 'issued-at' };
  const multiple = Array.isArray(aud) && aud.length > 1;
  if ((multiple && azp !== options.clientId) || (azp !== undefined && azp !== options.clientId)) return { ok: false, reason: 'authorized-party' };
  if (typeof nonce !== 'string' || nonce.length === 0 || nonce.length > 256 || !constantTimeEqual(sha256Hex(nonce), options.expectedNonceHash)) return { ok: false, reason: 'nonce' };
  if (typeof sub !== 'string' || sub.length === 0 || sub.length > 255) return { ok: false, reason: 'subject' };
  return { ok: true, identity: { sub, issuer: options.issuer, email: cleanEmail(payload['email']), emailVerified: emailVerified(payload['email_verified']) } };
}

export async function verifyIdToken(token: string, options: VerifyIdTokenOptions): Promise<VerifyResult> {
  const now = options.now ?? Date.now;
  if (typeof token !== 'string' || token.length === 0 || token.length > MAX_TOKEN_CHARS || !COMPACT.test(token)) return { ok: false, reason: 'malformed' };

  let header: ReturnType<typeof decodeProtectedHeader>;
  try { header = decodeProtectedHeader(token); } catch { return { ok: false, reason: 'malformed' }; }
  if (typeof header.alg !== 'string' || !(OIDC_ALLOWED_ALGORITHMS as readonly string[]).includes(header.alg)) return { ok: false, reason: 'unsupported-alg' };
  if (typeof header.kid !== 'string' || header.kid.length === 0) return { ok: false, reason: 'malformed' };

  const verifyAgainst = async (keys: ReadonlyArray<{ kty: 'RSA'; kid: string; n: string; e: string }>): Promise<Attempt> => {
    try {
      const { payload } = await jwtVerify(token, createLocalJWKSet({ keys: keys.map((k) => ({ ...k })) }), {
        issuer: options.issuer,
        audience: options.clientId,
        algorithms: [...OIDC_ALLOWED_ALGORITHMS],
        clockTolerance: OIDC_CLOCK_SKEW_SECONDS,
        currentDate: new Date(now()),
        requiredClaims: ['exp', 'iat', 'iss', 'aud', 'sub'],
      });
      return { payload };
    } catch (error) {
      return { failure: mapJoseError(error) };
    }
  };

  const first = await options.provider.jwks();
  if (first.status !== 'ok') return { ok: false, reason: 'unreachable' };
  let outcome = await verifyAgainst(first.keys);
  if ('failure' in outcome && outcome.failure === 'unknown-key') {
    const refreshed = await options.provider.jwks({ forceRefresh: true });
    if (refreshed.status !== 'ok') return { ok: false, reason: 'unreachable' };
    if (refreshed.refreshed) outcome = await verifyAgainst(refreshed.keys);
  }
  if ('failure' in outcome) return { ok: false, reason: outcome.failure };
  return checkPayload(outcome.payload, options, Math.floor(now() / 1000));
}
