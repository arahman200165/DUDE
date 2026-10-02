import { createPrivateKey, generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import type { DpapiPort } from './windows-sys-client';

/** DPAPI optional entropy binding the wrapped key to its purpose and format version. */
export const DEVICE_KEY_ENTROPY = new TextEncoder().encode('dude-device-key:v1');

export interface NewDeviceKey {
  /** Raw 32-byte Ed25519 public key. */
  readonly publicKeyRaw: Uint8Array;
  /** PKCS#8 DER, DPAPI-wrapped (CurrentUser). Safe to persist. */
  readonly wrappedPrivateKey: Uint8Array;
}

export async function createDeviceKey(dpapi: DpapiPort): Promise<NewDeviceKey> {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const x = publicKey.export({ format: 'jwk' }).x;
  if (typeof x !== 'string') throw new Error('Ed25519 public key export failed.');
  const publicKeyRaw = new Uint8Array(Buffer.from(x, 'base64url'));
  if (publicKeyRaw.length !== 32) throw new Error('Unexpected Ed25519 public key length.');
  const der = privateKey.export({ format: 'der', type: 'pkcs8' });
  try {
    const wrappedPrivateKey = await dpapi.protect(new Uint8Array(der.buffer, der.byteOffset, der.byteLength), DEVICE_KEY_ENTROPY);
    return { publicKeyRaw, wrappedPrivateKey };
  } finally {
    der.fill(0);
  }
}

export async function loadDeviceKey(dpapi: DpapiPort, wrapped: Uint8Array): Promise<KeyObject> {
  const der = await dpapi.unprotect(wrapped, DEVICE_KEY_ENTROPY);
  try {
    return createPrivateKey({ key: Buffer.from(der.buffer, der.byteOffset, der.byteLength), format: 'der', type: 'pkcs8' });
  } finally {
    der.fill(0);
  }
}

export function signWithDeviceKey(key: KeyObject, message: Uint8Array): Uint8Array {
  return new Uint8Array(sign(null, message, key));
}
