/**
 * Pure(-ish) JWT signature verification used by the JWT Signature Verifier
 * tool. Separate from `../jwt/jwt-decode.ts` (decode-only, no crypto) — this
 * is the tool that actually performs the deferred "signature verification"
 * capability (PRD Section 21 Phase 5 #38), always against a key the user
 * supplies directly or a JWKS URL they explicitly ask to fetch.
 *
 * `algorithm` is always passed to `jwtVerify` as a single-element allow-list
 * (never trusting the token's own `alg` header) to block algorithm-confusion
 * attacks — e.g. re-verifying an RS256 token as HS256 using its public key
 * bytes as an HMAC secret.
 */

import { base64url, createRemoteJWKSet, errors as joseErrors, importJWK, importSPKI, jwtVerify } from 'jose';

export type JwtVerifyMode = 'hmac' | 'public-key' | 'jwks';
export type PublicKeyFormat = 'pem' | 'jwk';

export interface JwtVerifyRequest {
  readonly token: string;
  readonly mode: JwtVerifyMode;
  readonly algorithm: string;
  readonly secret?: string;
  readonly keyMaterial?: string;
  readonly keyFormat?: PublicKeyFormat;
  readonly jwksUrl?: string;
}

export type JwtVerifyResult =
  | {
      readonly ok: true;
      readonly algorithm: string;
      readonly keySource: string;
      readonly payload: unknown;
      readonly protectedHeader: unknown;
    }
  | { readonly ok: false; readonly error: string };

export async function verifyJwt(request: JwtVerifyRequest): Promise<JwtVerifyResult> {
  const { token, mode, algorithm } = request;

  if (token.trim() === '') return { ok: false, error: 'Enter a JWT.' };
  if (!algorithm) return { ok: false, error: 'Select an algorithm to verify against.' };

  try {
    const { key, keySource } = await resolveKey(request);
    const verified = await jwtVerify(token, key, { algorithms: [algorithm] });
    return {
      ok: true,
      algorithm,
      keySource,
      payload: verified.payload,
      protectedHeader: verified.protectedHeader,
    };
  } catch (error) {
    if (error instanceof KeyResolutionError) return { ok: false, error: error.message };
    return { ok: false, error: describeVerifyError(error) };
  }
}

class KeyResolutionError extends Error {}

async function resolveKey(
  request: JwtVerifyRequest,
): Promise<{ key: Parameters<typeof jwtVerify>[1]; keySource: string }> {
  if (request.mode === 'hmac') {
    if (!request.secret) throw new KeyResolutionError('Enter the shared secret.');
    // Imported as a JWK rather than passed as a raw Uint8Array: `jwtVerify`
    // accepts either, but the JWK path avoids an `instanceof Uint8Array`
    // check inside jose that can spuriously fail across realm boundaries
    // (e.g. a typed array constructed in a different JS realm than jose's
    // own module graph was evaluated in).
    const k = base64url.encode(new TextEncoder().encode(request.secret));
    const key = await importJWK({ kty: 'oct', k }, request.algorithm);
    return { key, keySource: 'the HMAC secret you provided' };
  }

  if (request.mode === 'public-key') {
    if (!request.keyMaterial) throw new KeyResolutionError('Enter a public key (PEM or JWK).');
    const key =
      request.keyFormat === 'jwk'
        ? await importJWK(parseJwk(request.keyMaterial), request.algorithm)
        : await importSPKI(request.keyMaterial, request.algorithm);
    return { key, keySource: 'the public key you provided' };
  }

  if (!request.jwksUrl) throw new KeyResolutionError('Enter a JWKS URL.');
  let url: URL;
  try {
    url = new URL(request.jwksUrl);
  } catch {
    throw new KeyResolutionError('Enter a valid JWKS URL.');
  }
  return { key: createRemoteJWKSet(url), keySource: `a key fetched from ${url.host}` };
}

function parseJwk(text: string): Parameters<typeof importJWK>[0] {
  try {
    return JSON.parse(text);
  } catch {
    throw new KeyResolutionError('The JWK is not valid JSON.');
  }
}

function describeVerifyError(error: unknown): string {
  if (error instanceof joseErrors.JWSSignatureVerificationFailed) {
    return 'Signature verification failed — the token was not signed with this key/secret.';
  }
  if (error instanceof joseErrors.JOSEAlgNotAllowed) {
    return "The token's algorithm does not match the algorithm you selected.";
  }
  if (error instanceof joseErrors.JWKSNoMatchingKey) {
    return 'No key in the JWKS matches this token\'s "kid".';
  }
  if (error instanceof joseErrors.JWKSMultipleMatchingKeys) {
    return 'Multiple keys in the JWKS match this token — cannot pick one unambiguously.';
  }
  if (error instanceof joseErrors.JWKSTimeout) {
    return 'Timed out fetching the JWKS URL.';
  }
  if (error instanceof joseErrors.JWTExpired) {
    return 'The signature is valid, but the token has expired ("exp" claim).';
  }
  if (error instanceof TypeError && /fetch/i.test(error.message)) {
    return 'Could not reach the JWKS URL — this may be a network issue or the server blocking cross-origin requests (CORS).';
  }
  if (error instanceof Error) return error.message;
  return 'Verification failed.';
}
