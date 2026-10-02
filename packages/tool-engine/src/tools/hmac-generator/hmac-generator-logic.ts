import { hostCrypto } from "@dude/crypto/host";
import { hexToBytes } from "../../shared/utils/byte-codec.js";

export type HmacKeyEncoding = 'utf8' | 'hex' | 'base64';
export type HmacHashAlgorithm = 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512';

export const HMAC_HASH_ALGORITHMS: readonly HmacHashAlgorithm[] = ['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512'];

export type HmacResult = { readonly ok: true; readonly value: string } | { readonly ok: false; readonly error: string };

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function decodeKey(key: string, encoding: HmacKeyEncoding): { readonly ok: true; readonly value: Uint8Array } | { readonly ok: false; readonly error: string } {
  switch (encoding) {
    case 'utf8':
      return { ok: true, value: new TextEncoder().encode(key) };
    case 'hex':
      return hexToBytes(key);
    case 'base64':
      try {
        const binary = atob(key.trim());
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return { ok: true, value: bytes };
      } catch {
        return { ok: false, error: 'Key is not valid Base64.' };
      }
  }
}

/** Web Crypto's HMAC has no MD5 support, so the hash choices are a subset of the Hash Generator's. */
export async function computeHmac(
  message: string,
  key: string,
  keyEncoding: HmacKeyEncoding,
  hash: HmacHashAlgorithm,
): Promise<HmacResult> {
  if (key === '') return { ok: false, error: 'Enter a key.' };

  const keyBytes = decodeKey(key, keyEncoding);
  if (!keyBytes.ok) return keyBytes;
  if (keyBytes.value.length === 0) return { ok: false, error: 'Key decodes to zero bytes.' };

  const cryptoKey = await hostCrypto().subtle.importKey(
    'raw',
    keyBytes.value as BufferSource,
    { name: 'HMAC', hash: { name: hash } },
    false,
    ['sign'],
  );
  const signature = await hostCrypto().subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message));
  return { ok: true, value: toHex(signature) };
}
