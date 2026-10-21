import type { HashAlgorithm } from '@dude/shared-types/hash-algorithm';
import type { KeyValueRow } from '../../kit';

/** Inputs above this many UTF-8 bytes are rejected on Android (budgets are refined later). */
export const MAX_INPUT_BYTES = 2 * 1024 * 1024;
export const INPUT_TOO_LARGE = 'Input is larger than 2 MiB. Android hashes up to 2 MiB of text at a time.';

export type HashOutputFormat = 'hex' | 'base64';

/** Display order and grouping of the web tool. XXH32/XXH64 need WebAssembly, which Hermes lacks. */
export const HASH_ORDER: readonly HashAlgorithm[] = [
  'MD5', 'SHA-1', 'SHA-256', 'SHA-384', 'SHA-512', 'SHA3-256', 'SHA3-384', 'SHA3-512', 'BLAKE2b', 'BLAKE2s', 'BLAKE3', 'XXH32', 'XXH64', 'CRC32', 'CRC64',
];
export const UNAVAILABLE_ALGORITHMS: readonly HashAlgorithm[] = ['XXH32', 'XXH64'];
export const COMPUTED_ALGORITHMS: readonly HashAlgorithm[] = HASH_ORDER.filter(algorithm => !UNAVAILABLE_ALGORITHMS.includes(algorithm));
export const UNAVAILABLE_TEXT = 'Unavailable on Android (needs WebAssembly)';

/** UTF-8 byte length of a JS string (lone surrogates count as the 3-byte replacement character, like TextEncoder). */
export function utf8ByteLength(text: string): number {
  let bytes = 0;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < text.length && text.charCodeAt(index + 1) >= 0xdc00 && text.charCodeAt(index + 1) <= 0xdfff) { bytes += 4; index += 1; }
    else bytes += 3;
  }
  return bytes;
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Standard padded Base64 of a hex string. Hand-rolled so it does not depend on `btoa`. */
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

/** One row per algorithm in the web order; algorithms without a digest become "unavailable" rows. */
export function buildHashRows(digests: ReadonlyMap<string, string>, format: HashOutputFormat): readonly KeyValueRow[] {
  return HASH_ORDER.map(algorithm => {
    const hex = digests.get(algorithm);
    return { key: algorithm, label: algorithm, value: hex === undefined ? UNAVAILABLE_TEXT : format === 'base64' ? hexToBase64(hex) : hex };
  });
}
