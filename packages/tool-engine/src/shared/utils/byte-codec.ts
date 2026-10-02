/**
 * Pure, framework-free byte <-> text/hex/binary helpers shared by Phase 11's
 * hex/base-N/hex-dump family (Hex <-> Text Converter, Base-N Encoder/Decoder,
 * Hex Dump Viewer/Builder), extracted up front since all three need it at once.
 */

export type ByteTextResult = { readonly ok: true; readonly value: string } | { readonly ok: false; readonly error: string };

export type BytesResult = { readonly ok: true; readonly value: Uint8Array } | { readonly ok: false; readonly error: string };

const HEX_DIGITS = '0123456789abcdef';

export function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) out += HEX_DIGITS[byte >> 4] + HEX_DIGITS[byte & 0xf];
  return out;
}

/** Space-separated byte-pair hex, e.g. "00 ff 10" -- for display, not round-tripping (see `hexToBytes` for that). */
export function bytesToHexSpaced(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => bytesToHex(new Uint8Array([byte]))).join(' ');
}

/** Accepts hex with optional whitespace/colon/dash separators between byte pairs. */
export function hexToBytes(hex: string): BytesResult {
  const cleaned = hex.replace(/[\s:,-]+/g, '');
  if (cleaned === '') return { ok: false, error: 'Enter some hex.' };
  if (cleaned.length % 2 !== 0) return { ok: false, error: 'Hex string must have an even number of digits.' };
  if (!/^[0-9a-fA-F]*$/.test(cleaned)) return { ok: false, error: 'Contains non-hex characters.' };

  const bytes = new Uint8Array(cleaned.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(cleaned.substring(i * 2, i * 2 + 2), 16);
  }
  return { ok: true, value: bytes };
}

export function bytesToBinaryString(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(2).padStart(8, '0')).join(' ');
}

/** Accepts whitespace-separated groups of up to 8 binary digits, one group per byte. */
export function binaryStringToBytes(input: string): BytesResult {
  const groups = input.trim().split(/\s+/).filter(Boolean);
  if (groups.length === 0) return { ok: false, error: 'Enter some binary.' };

  const bytes = new Uint8Array(groups.length);
  for (const [i, group] of groups.entries()) {
    if (!/^[01]{1,8}$/.test(group)) return { ok: false, error: `"${group}" is not a valid 8-bit binary group.` };
    bytes[i] = parseInt(group, 2);
  }
  return { ok: true, value: bytes };
}

export function textToBytesUtf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

export function bytesToTextUtf8(bytes: Uint8Array): ByteTextResult {
  try {
    return { ok: true, value: new TextDecoder('utf-8', { fatal: true }).decode(bytes) };
  } catch {
    return { ok: false, error: 'Bytes are not valid UTF-8.' };
  }
}

export function textToBytesAscii(text: string): BytesResult {
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code > 127) return { ok: false, error: `"${text[i]}" is not an ASCII character.` };
    bytes[i] = code;
  }
  return { ok: true, value: bytes };
}

export function bytesToTextAscii(bytes: Uint8Array): ByteTextResult {
  let out = '';
  for (const byte of bytes) {
    if (byte > 127) return { ok: false, error: 'Bytes contain a non-ASCII value (greater than 127).' };
    out += String.fromCharCode(byte);
  }
  return { ok: true, value: out };
}

export type Utf16Endianness = 'LE' | 'BE';

export function textToBytesUtf16(text: string, endianness: Utf16Endianness): Uint8Array {
  const bytes = new Uint8Array(text.length * 2);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < text.length; i++) {
    view.setUint16(i * 2, text.charCodeAt(i), endianness === 'LE');
  }
  return bytes;
}

export function bytesToTextUtf16(bytes: Uint8Array, endianness: Utf16Endianness): ByteTextResult {
  if (bytes.length % 2 !== 0) return { ok: false, error: 'UTF-16 byte input must have an even length.' };

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let out = '';
  for (let i = 0; i < bytes.length; i += 2) {
    out += String.fromCharCode(view.getUint16(i, endianness === 'LE'));
  }
  return { ok: true, value: out };
}
