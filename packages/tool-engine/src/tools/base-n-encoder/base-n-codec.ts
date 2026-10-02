import baseX from 'base-x';
import { base32 } from 'rfc4648';
import { binaryStringToBytes, bytesToBinaryString, bytesToHex, hexToBytes } from "../../shared/utils/byte-codec.js";

export type BaseNMode = 'base2' | 'base16' | 'base32' | 'base36' | 'base58' | 'base62' | 'base85' | 'base91';

export interface BaseNModeInfo {
  readonly id: BaseNMode;
  readonly label: string;
}

export const BASE_N_MODES: readonly BaseNModeInfo[] = [
  { id: 'base2', label: 'Binary' },
  { id: 'base16', label: 'Base16 (Hex)' },
  { id: 'base32', label: 'Base32' },
  { id: 'base36', label: 'Base36' },
  { id: 'base58', label: 'Base58' },
  { id: 'base62', label: 'Base62' },
  { id: 'base85', label: 'Base85 / ASCII85' },
  { id: 'base91', label: 'basE91' },
];

export type BaseNBytesResult = { readonly ok: true; readonly value: Uint8Array } | { readonly ok: false; readonly error: string };

const BASE36_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const BASE62_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

const base36Codec = baseX(BASE36_ALPHABET);
const base58Codec = baseX(BASE58_ALPHABET);
const base62Codec = baseX(BASE62_ALPHABET);

export function encodeBytes(bytes: Uint8Array, mode: BaseNMode): string {
  switch (mode) {
    case 'base2':
      return bytesToBinaryString(bytes);
    case 'base16':
      return bytesToHex(bytes);
    case 'base32':
      return base32.stringify(bytes);
    case 'base36':
      return base36Codec.encode(bytes);
    case 'base58':
      return base58Codec.encode(bytes);
    case 'base62':
      return base62Codec.encode(bytes);
    case 'base85':
      return encodeBase85(bytes);
    case 'base91':
      return encodeBase91(bytes);
  }
}

export function decodeToBytes(input: string, mode: BaseNMode): BaseNBytesResult {
  try {
    switch (mode) {
      case 'base2':
        return binaryStringToBytes(input);
      case 'base16':
        return hexToBytes(input);
      case 'base32':
        return decodeNonEmpty(input, (trimmed) => base32.parse(trimmed, { loose: true }));
      case 'base36':
        return decodeBaseX(base36Codec, input, 'Base36');
      case 'base58':
        return decodeBaseX(base58Codec, input, 'Base58');
      case 'base62':
        return decodeBaseX(base62Codec, input, 'Base62');
      case 'base85':
        return decodeBase85(input);
      case 'base91':
        return decodeBase91(input);
    }
  } catch {
    return { ok: false, error: `Invalid ${modeLabel(mode)} input.` };
  }
}

function modeLabel(mode: BaseNMode): string {
  return BASE_N_MODES.find((m) => m.id === mode)?.label ?? mode;
}

function decodeNonEmpty(input: string, parse: (trimmed: string) => Uint8Array): BaseNBytesResult {
  const trimmed = input.trim();
  if (trimmed === '') return { ok: false, error: 'Enter some input.' };
  return { ok: true, value: parse(trimmed) };
}

function decodeBaseX(
  codec: ReturnType<typeof baseX>,
  input: string,
  label: string,
): BaseNBytesResult {
  const trimmed = input.trim();
  if (trimmed === '') return { ok: false, error: 'Enter some input.' };
  const decoded = codec.decodeUnsafe(trimmed);
  if (!decoded) return { ok: false, error: `Invalid ${label} input.` };
  return { ok: true, value: decoded };
}

// --- Base85 / ASCII85 (Adobe variant: no "z" all-zero shortcut, no <~ ~> delimiters) ---

const BASE85_OFFSET = 33; // '!'
const BASE85_MAX_CODE = 117; // 'u'

function encodeBase85(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 4) {
    const n = Math.min(4, bytes.length - i);
    let value = (bytes[i] ?? 0) * 0x1000000 + (bytes[i + 1] ?? 0) * 0x10000 + (bytes[i + 2] ?? 0) * 0x100 + (bytes[i + 3] ?? 0);

    const digits = [0, 0, 0, 0, 0];
    for (let d = 4; d >= 0; d--) {
      digits[d] = value % 85;
      value = Math.floor(value / 85);
    }

    for (let d = 0; d < n + 1; d++) out += String.fromCharCode(digits[d] + BASE85_OFFSET);
  }
  return out;
}

function decodeBase85(input: string): BaseNBytesResult {
  const chars = input.replace(/\s+/g, '');
  if (chars === '') return { ok: false, error: 'Enter some input.' };

  for (const ch of chars) {
    const code = ch.charCodeAt(0);
    if (code < BASE85_OFFSET || code > BASE85_MAX_CODE) return { ok: false, error: `"${ch}" is not a valid Base85 character.` };
  }

  const bytes: number[] = [];
  for (let i = 0; i < chars.length; i += 5) {
    const group = chars.slice(i, i + 5);
    if (group.length === 1) return { ok: false, error: 'Invalid Base85 input: a final group cannot be a single character.' };

    const padded = group.padEnd(5, 'u');
    let value = 0;
    for (let d = 0; d < 5; d++) value = value * 85 + (padded.charCodeAt(d) - BASE85_OFFSET);
    if (value > 0xffffffff) return { ok: false, error: 'Invalid Base85 group: value out of range.' };

    const groupBytes = [Math.floor(value / 0x1000000) & 0xff, Math.floor(value / 0x10000) & 0xff, Math.floor(value / 0x100) & 0xff, value & 0xff];
    const outCount = group.length === 5 ? 4 : group.length - 1;
    for (let d = 0; d < outCount; d++) bytes.push(groupBytes[d]);
  }

  return { ok: true, value: Uint8Array.from(bytes) };
}

// --- basE91 (Joachim Henke's basE91) ---

const BASE91_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!#$%&()*+,./:;<=>?@[]^_`{|}~"';

function encodeBase91(bytes: Uint8Array): string {
  let b = 0;
  let n = 0;
  let out = '';

  for (const byte of bytes) {
    b |= byte << n;
    n += 8;
    if (n > 13) {
      let v = b & 8191;
      if (v > 88) {
        b >>= 13;
        n -= 13;
      } else {
        v = b & 16383;
        b >>= 14;
        n -= 14;
      }
      out += BASE91_ALPHABET[v % 91] + BASE91_ALPHABET[Math.floor(v / 91)];
    }
  }

  if (n) {
    out += BASE91_ALPHABET[b % 91];
    if (n > 7 || b > 90) out += BASE91_ALPHABET[Math.floor(b / 91)];
  }

  return out;
}

function decodeBase91(input: string): BaseNBytesResult {
  const chars = input.replace(/\s+/g, '');
  if (chars === '') return { ok: false, error: 'Enter some input.' };

  const index = new Map<string, number>();
  for (let i = 0; i < BASE91_ALPHABET.length; i++) index.set(BASE91_ALPHABET[i], i);

  let b = 0;
  let n = 0;
  let v = -1;
  const bytes: number[] = [];

  for (const ch of chars) {
    const d = index.get(ch);
    if (d === undefined) return { ok: false, error: `"${ch}" is not a valid basE91 character.` };

    if (v < 0) {
      v = d;
      continue;
    }

    v += d * 91;
    b |= v << n;
    n += (v & 8191) > 88 ? 13 : 14;
    while (n >= 8) {
      bytes.push(b & 255);
      b >>= 8;
      n -= 8;
    }
    v = -1;
  }

  if (v >= 0) bytes.push((b | (v << n)) & 255);

  return { ok: true, value: Uint8Array.from(bytes) };
}
