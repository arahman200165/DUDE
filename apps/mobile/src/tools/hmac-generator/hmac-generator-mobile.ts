import {
  computeHmac, HMAC_HASH_ALGORITHMS, type HmacHashAlgorithm, type HmacKeyEncoding,
} from '@dude/tool-engine/tools/hmac-generator/hmac-generator-logic';

export type HmacOutputFormat = 'hex' | 'base64';
export const HASHES: readonly HmacHashAlgorithm[] = HMAC_HASH_ALGORITHMS;
export const KEY_ENCODINGS: readonly { readonly id: HmacKeyEncoding; readonly label: string }[] = [
  { id: 'utf8', label: 'UTF-8' }, { id: 'hex', label: 'Hex' }, { id: 'base64', label: 'Base64' },
];
export type HmacOutcome = { readonly ok: true; readonly value: string } | { readonly ok: false; readonly error: string };

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Standard padded Base64 of a lowercase/uppercase hex string (the engine returns hex). Hand-rolled so it does not depend on `btoa`. */
export function hexToBase64(hex: string): string {
  const bytes: number[] = [];
  for (let index = 0; index + 1 < hex.length; index += 2) bytes.push(parseInt(hex.slice(index, index + 2), 16));
  let out = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index]!;
    const b = bytes[index + 1];
    const c = bytes[index + 2];
    const chunk = (a << 16) | ((b ?? 0) << 8) | (c ?? 0);
    out += ALPHABET[(chunk >> 18) & 63]! + ALPHABET[(chunk >> 12) & 63]!;
    out += b === undefined ? '=' : ALPHABET[(chunk >> 6) & 63]!;
    out += c === undefined ? '=' : ALPHABET[chunk & 63]!;
  }
  return out;
}

/** HMAC through the shared engine (crypto.subtle importKey/sign from the engine host). Never throws. */
export async function hmacFor(message: string, key: string, keyEncoding: HmacKeyEncoding, hash: HmacHashAlgorithm, format: HmacOutputFormat): Promise<HmacOutcome> {
  try {
    const result = await computeHmac(message, key, keyEncoding, hash);
    if (!result.ok) return result;
    return { ok: true, value: format === 'base64' ? hexToBase64(result.value) : result.value };
  } catch (error) {
    return { ok: false, error: error instanceof Error && error.message ? error.message : 'Could not compute the HMAC.' };
  }
}
