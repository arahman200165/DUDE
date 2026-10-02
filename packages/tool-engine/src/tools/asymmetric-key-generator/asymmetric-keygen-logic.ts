/**
 * Pure asymmetric key-pair generation, generalizing
 * `../jwt-signer/jwt-signer-logic.ts`'s `generateSigningKeyPair` beyond a
 * JWT-algorithm-specific picker into a plain family/curve/modulus-length
 * choice. `jose`'s `generateKeyPair` still needs a JWA algorithm identifier
 * internally (it's how it derives the underlying `crypto.subtle` params),
 * but that choice is an implementation detail here, not user-facing — a
 * generated RSA key pair is hash-agnostic at the key-material level, so any
 * `RS*` alg produces an equivalent key for a given modulus length.
 */

import { exportJWK, exportPKCS8, exportSPKI, generateKeyPair } from 'jose';

export type KeyFamily = 'rsa' | 'ec' | 'ed25519';
export type RsaModulusLength = 2048 | 3072 | 4096;
export type EcCurve = 'P-256' | 'P-384' | 'P-521';

export const RSA_MODULUS_LENGTHS: readonly RsaModulusLength[] = [2048, 3072, 4096];
export const EC_CURVES: readonly EcCurve[] = ['P-256', 'P-384', 'P-521'];

const EC_ALG_BY_CURVE: Record<EcCurve, string> = { 'P-256': 'ES256', 'P-384': 'ES384', 'P-521': 'ES512' };

export interface AsymmetricKeyGenRequest {
  readonly family: KeyFamily;
  readonly modulusLength?: RsaModulusLength;
  readonly curve?: EcCurve;
}

export interface AsymmetricKeyPair {
  readonly family: KeyFamily;
  /** Human-readable key detail, e.g. "RSA-2048", "P-384", "Ed25519". */
  readonly detail: string;
  readonly publicKeyPem: string;
  readonly privateKeyPem: string;
  readonly publicKeyJwk: string;
  readonly privateKeyJwk: string;
}

export async function generateAsymmetricKeyPair(request: AsymmetricKeyGenRequest): Promise<AsymmetricKeyPair> {
  let alg: string;
  let detail: string;
  let modulusLength: number | undefined;

  if (request.family === 'rsa') {
    modulusLength = request.modulusLength ?? 2048;
    alg = 'RS256';
    detail = `RSA-${modulusLength}`;
  } else if (request.family === 'ec') {
    const curve = request.curve ?? 'P-256';
    alg = EC_ALG_BY_CURVE[curve];
    detail = curve;
  } else {
    alg = 'Ed25519';
    detail = 'Ed25519';
  }

  const { publicKey, privateKey } = await generateKeyPair(alg, { extractable: true, modulusLength });
  const [publicKeyPem, privateKeyPem, publicKeyJwk, privateKeyJwk] = await Promise.all([
    exportSPKI(publicKey),
    exportPKCS8(privateKey),
    exportJWK(publicKey),
    exportJWK(privateKey),
  ]);

  return {
    family: request.family,
    detail,
    publicKeyPem,
    privateKeyPem,
    publicKeyJwk: JSON.stringify(publicKeyJwk, null, 2),
    privateKeyJwk: JSON.stringify(privateKeyJwk, null, 2),
  };
}
