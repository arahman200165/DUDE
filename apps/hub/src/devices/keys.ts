import { createPublicKey, verify } from 'node:crypto';
import type { KeyObject } from 'node:crypto';

export const ED25519_PUBLIC_KEY_BYTES = 32;
export const ED25519_SIGNATURE_BYTES = 64;

/** Strict base64url decode: only the URL-safe alphabet, canonical (re-encodes to the same text), exact byte length. */
export function decodeBase64url(text: string, bytes: number): Buffer | null {
  if (typeof text !== 'string' || !/^[A-Za-z0-9_-]+$/.test(text)) return null;
  const buffer = Buffer.from(text, 'base64url');
  return buffer.length === bytes && buffer.toString('base64url') === text ? buffer : null;
}

/** An Ed25519 public key from its 32 raw bytes, or null when Node refuses it. */
export function publicKeyFromRaw(raw: Uint8Array): KeyObject | null {
  if (raw.length !== ED25519_PUBLIC_KEY_BYTES) return null;
  try {
    return createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: Buffer.from(raw).toString('base64url') }, format: 'jwk' });
  } catch {
    return null;
  }
}

/** True when `signature` (64 raw bytes) is a valid Ed25519 signature of the UTF-8 `message` under the raw public key. */
export function verifyEd25519(rawPublicKey: Uint8Array, message: string, signature: Uint8Array): boolean {
  if (signature.length !== ED25519_SIGNATURE_BYTES) return false;
  const key = publicKeyFromRaw(rawPublicKey);
  if (key === null) return false;
  try {
    return verify(null, Buffer.from(message, 'utf8'), key, signature);
  } catch {
    return false;
  }
}
