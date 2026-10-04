/**
 * ES256 (P-256) JWS in the flattened JSON serialization, as used by ACME (RFC 8555 section 6.2),
 * plus the RFC 7638 JWK thumbprint and the RFC 8555 section 8.1 key authorization.
 */
import { createHash, createPublicKey, sign } from 'node:crypto';
import type { KeyObject } from 'node:crypto';

export interface EcJwk { crv: 'P-256'; kty: 'EC'; x: string; y: string }

export interface FlattenedJws { protected: string; payload: string; signature: string }

export const base64url = (data: Buffer | string): string => Buffer.from(data).toString('base64url');

/** The public JWK (`crv`, `kty`, `x`, `y` only) of a P-256 public or private key. */
export function jwkOf(key: KeyObject): EcJwk {
  const pub = key.type === 'private' ? createPublicKey(key) : key;
  const jwk = pub.export({ format: 'jwk' });
  if (jwk.kty !== 'EC' || jwk.crv !== 'P-256' || !jwk.x || !jwk.y) throw new Error('ACME account keys must be P-256 EC keys');
  return { crv: 'P-256', kty: 'EC', x: jwk.x, y: jwk.y };
}

/** RFC 7638: base64url SHA-256 of the canonical JSON with members in lexicographic order and no whitespace. */
export function jwkThumbprint(jwk: EcJwk): string {
  const canonical = `{"crv":${JSON.stringify(jwk.crv)},"kty":${JSON.stringify(jwk.kty)},"x":${JSON.stringify(jwk.x)},"y":${JSON.stringify(jwk.y)}}`;
  return createHash('sha256').update(canonical, 'utf8').digest('base64url');
}

/** `token || '.' || thumbprint` per RFC 8555 section 8.1. */
export const keyAuthorization = (token: string, jwk: EcJwk): string => `${token}.${jwkThumbprint(jwk)}`;

export interface SignJwsInput {
  key: KeyObject;
  /** Must carry `alg`, `url`, `nonce` and exactly one of `jwk` / `kid` (the caller's responsibility). */
  protectedHeader: Record<string, unknown>;
  /** A JSON-serializable payload, or the empty string for POST-as-GET. */
  payload: unknown;
}

export function signJws({ key, protectedHeader, payload }: SignJwsInput): FlattenedJws {
  const protectedB64 = base64url(JSON.stringify(protectedHeader));
  const payloadB64 = payload === '' ? '' : base64url(JSON.stringify(payload));
  const signature = sign('sha256', Buffer.from(`${protectedB64}.${payloadB64}`, 'ascii'), { key, dsaEncoding: 'ieee-p1363' });
  return { protected: protectedB64, payload: payloadB64, signature: base64url(signature) };
}
