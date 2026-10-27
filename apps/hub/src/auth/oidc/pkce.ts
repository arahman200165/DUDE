import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * PKCE (RFC 7636), `state` and `nonce` generation and the constant-time comparisons the OIDC flow needs. Every secret is 32 random
 * bytes from the platform CSPRNG, base64url-encoded (43 characters: inside RFC 7636's 43 to 128 verifier length and unguessable).
 */

const BASE64URL = /^[A-Za-z0-9_-]+$/;

const randomToken = (bytes = 32): string => randomBytes(bytes).toString('base64url');

export const generateCodeVerifier = (): string => randomToken();
export const generateState = (): string => randomToken();
export const generateNonce = (): string => randomToken();

/** `BASE64URL(SHA256(ASCII(verifier)))` (RFC 7636 section 4.2, method S256; padding omitted). */
export function codeChallengeS256(verifier: string): string {
  return createHash('sha256').update(verifier, 'ascii').digest('base64url');
}

/** RFC 7636 section 4.1: 43 to 128 characters of `[A-Za-z0-9-._~]`. */
export function isValidCodeVerifier(value: string): boolean {
  return value.length >= 43 && value.length <= 128 && /^[A-Za-z0-9._~-]+$/.test(value);
}

/** A well-formed base64url token of a plausible size (what `state` and `nonce` are). Rejects before any hashing or database lookup. */
export function isWellFormedToken(value: unknown, min = 16, max = 256): value is string {
  return typeof value === 'string' && value.length >= min && value.length <= max && BASE64URL.test(value);
}

/** The hex SHA-256 under which `state` and `nonce` are stored: the database never holds the raw value. */
export const sha256Hex = (value: string): string => createHash('sha256').update(value, 'utf8').digest('hex');

/** Constant-time string comparison (equal length after hashing both sides, so lengths never leak). */
export function constantTimeEqual(a: string, b: string): boolean {
  const left = createHash('sha256').update(a, 'utf8').digest();
  const right = createHash('sha256').update(b, 'utf8').digest();
  return timingSafeEqual(left, right);
}
