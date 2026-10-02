/**
 * Pure, framework-free JWT decoding used by the JWT Debugger tool.
 *
 * This only decodes the header/payload segments and reports the raw
 * signature segment — it never attempts signature verification (PRD
 * Section 31: never claim that decoding verifies authenticity).
 */

export type JwtExpiryStatus =
  | { readonly kind: 'no-claim' }
  | { readonly kind: 'valid'; readonly expiresAt: Date }
  | { readonly kind: 'expired'; readonly expiresAt: Date };

export type JwtDecodeResult =
  | {
      readonly ok: true;
      readonly header: unknown;
      readonly payload: unknown;
      readonly signature: string;
      readonly expiry: JwtExpiryStatus;
    }
  | { readonly ok: false; readonly error: string };

function base64UrlDecodeToString(segment: string): string {
  const normalized = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

export function decodeJwt(token: string, now: Date = new Date()): JwtDecodeResult {
  const trimmed = token.trim();
  if (trimmed === '') return { ok: false, error: 'Enter a JWT.' };

  const parts = trimmed.split('.');
  if (parts.length !== 3) {
    return { ok: false, error: 'A JWT must have three dot-separated segments: header.payload.signature.' };
  }

  const [headerSegment, payloadSegment, signatureSegment] = parts;

  let header: unknown;
  try {
    header = JSON.parse(base64UrlDecodeToString(headerSegment));
  } catch {
    return { ok: false, error: 'Could not decode the header segment — it is not valid Base64url/JSON.' };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(base64UrlDecodeToString(payloadSegment));
  } catch {
    return { ok: false, error: 'Could not decode the payload segment — it is not valid Base64url/JSON.' };
  }

  return { ok: true, header, payload, signature: signatureSegment, expiry: computeExpiryStatus(payload, now) };
}

export function decodeTemporalClaim(payload: unknown, claim: 'iat' | 'nbf' | 'exp'): Date | null {
  if (!payload || typeof payload !== 'object' || !(claim in payload)) return null;
  const value = (payload as Record<string, unknown>)[claim];
  return typeof value === 'number' ? new Date(value * 1000) : null;
}

function computeExpiryStatus(payload: unknown, now: Date): JwtExpiryStatus {
  const expiresAt = decodeTemporalClaim(payload, 'exp');
  if (!expiresAt) return { kind: 'no-claim' };
  return expiresAt.getTime() <= now.getTime() ? { kind: 'expired', expiresAt } : { kind: 'valid', expiresAt };
}
