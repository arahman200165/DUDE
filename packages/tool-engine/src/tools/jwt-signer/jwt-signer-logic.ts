/**
 * Pure(-ish) JWT signing for the JWT Signer tool. Mirrors
 * `../jwt-verify/jwt-verify-logic.ts`'s key-resolution shape but produces a
 * token instead of verifying one. Supports symmetric (HMAC) signing and
 * asymmetric (private-key) signing, either from a pasted private key or a
 * freshly generated in-browser key pair.
 */

import {
  base64url,
  exportJWK,
  exportPKCS8,
  exportSPKI,
  generateKeyPair,
  importJWK,
  importPKCS8,
  SignJWT,
} from 'jose';

export type JwtSignMode = 'hmac' | 'private-key';
export type PrivateKeyFormat = 'pem' | 'jwk';

export interface JwtSignRequest {
  readonly claimsJson: string;
  readonly mode: JwtSignMode;
  readonly algorithm: string;
  readonly secret?: string;
  readonly keyMaterial?: string;
  readonly keyFormat?: PrivateKeyFormat;
}

export type JwtSignResult = { readonly ok: true; readonly token: string } | { readonly ok: false; readonly error: string };

class KeyResolutionError extends Error {}

export async function signJwt(request: JwtSignRequest): Promise<JwtSignResult> {
  let claims: unknown;
  try {
    claims = JSON.parse(request.claimsJson);
  } catch {
    return { ok: false, error: 'Claims must be valid JSON.' };
  }
  if (typeof claims !== 'object' || claims === null || Array.isArray(claims)) {
    return { ok: false, error: 'Claims must be a JSON object.' };
  }
  if (!request.algorithm) return { ok: false, error: 'Select an algorithm.' };

  try {
    const key = await resolveSigningKey(request);
    const token = await new SignJWT(claims as Record<string, unknown>)
      .setProtectedHeader({ alg: request.algorithm })
      .sign(key);
    return { ok: true, token };
  } catch (error) {
    if (error instanceof KeyResolutionError) return { ok: false, error: error.message };
    return { ok: false, error: error instanceof Error ? error.message : 'Signing failed.' };
  }
}

async function resolveSigningKey(request: JwtSignRequest) {
  if (request.mode === 'hmac') {
    if (!request.secret) throw new KeyResolutionError('Enter the shared secret.');
    const k = base64url.encode(new TextEncoder().encode(request.secret));
    return importJWK({ kty: 'oct', k }, request.algorithm);
  }

  if (!request.keyMaterial) throw new KeyResolutionError('Enter a private key (PEM or JWK), or generate one below.');
  return request.keyFormat === 'jwk'
    ? importJWK(parseJwk(request.keyMaterial), request.algorithm)
    : importPKCS8(request.keyMaterial, request.algorithm);
}

function parseJwk(text: string): Parameters<typeof importJWK>[0] {
  try {
    return JSON.parse(text);
  } catch {
    throw new KeyResolutionError('The private key JWK is not valid JSON.');
  }
}

export interface GeneratedKeyPair {
  readonly algorithm: string;
  readonly publicKeyPem: string;
  readonly privateKeyPem: string;
  readonly publicKeyJwk: string;
  readonly privateKeyJwk: string;
}

export async function generateSigningKeyPair(algorithm: string): Promise<GeneratedKeyPair> {
  const { publicKey, privateKey } = await generateKeyPair(algorithm, { extractable: true });
  const [publicKeyPem, privateKeyPem, publicKeyJwk, privateKeyJwk] = await Promise.all([
    exportSPKI(publicKey),
    exportPKCS8(privateKey),
    exportJWK(publicKey),
    exportJWK(privateKey),
  ]);
  return {
    algorithm,
    publicKeyPem,
    privateKeyPem,
    publicKeyJwk: JSON.stringify(publicKeyJwk, null, 2),
    privateKeyJwk: JSON.stringify(privateKeyJwk, null, 2),
  };
}
