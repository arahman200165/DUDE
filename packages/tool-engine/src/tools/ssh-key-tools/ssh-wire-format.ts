/**
 * Pure, framework-free OpenSSH wire-format (RFC 4251) encode/decode
 * primitives. Hand-rolled rather than a library: node-forge has no OpenSSH
 * support, and a Node-oriented SSH-key package is a poor browser fit with
 * extra transitive deps — this is comparable in fiddliness to Phase 11's
 * hand-rolled Base85/basE91, not to cipher-grade math.
 */

function uint32BE(n: number): Uint8Array {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, n, false);
  return out;
}

export function concat(...parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** RFC 4251 §5 `string`: a uint32 big-endian length prefix followed by the raw bytes. */
export function sshString(bytes: Uint8Array): Uint8Array {
  return concat(uint32BE(bytes.length), bytes);
}

export function sshStringFromText(text: string): Uint8Array {
  return sshString(new TextEncoder().encode(text));
}

/**
 * RFC 4251 §5 `mpint`: two's-complement, minimal-length, big-endian.
 * `magnitude` is treated as an unsigned big-endian value (as decoded from a
 * base64url JWK component) — any padding leading zero bytes are stripped,
 * then a single `0x00` is prepended only if the remaining high bit is set
 * (so the value isn't misread as negative).
 */
export function mpint(magnitude: Uint8Array): Uint8Array {
  let start = 0;
  while (start < magnitude.length - 1 && magnitude[start] === 0) start++;
  const trimmed = magnitude.slice(start);

  if (trimmed.length === 0) return sshString(new Uint8Array(0));

  const needsPad = (trimmed[0] & 0x80) !== 0;
  return sshString(needsPad ? concat(new Uint8Array([0]), trimmed) : trimmed);
}

/** Bit length of an unsigned big-endian magnitude, ignoring any leading zero bytes. */
export function bitLength(magnitude: Uint8Array): number {
  let start = 0;
  while (start < magnitude.length - 1 && magnitude[start] === 0) start++;
  const trimmed = magnitude.slice(start);
  if (trimmed.length === 0 || (trimmed.length === 1 && trimmed[0] === 0)) return 0;

  let bits = (trimmed.length - 1) * 8;
  let msb = trimmed[0];
  while (msb > 0) {
    bits++;
    msb >>= 1;
  }
  return bits;
}

export interface SshReader {
  readonly bytes: Uint8Array;
  offset: number;
}

export function createReader(bytes: Uint8Array): SshReader {
  return { bytes, offset: 0 };
}

export function hasMore(reader: SshReader): boolean {
  return reader.offset < reader.bytes.length;
}

export function readUint32(reader: SshReader): number {
  if (reader.offset + 4 > reader.bytes.length) throw new Error('Truncated: expected a 4-byte length prefix.');
  const view = new DataView(reader.bytes.buffer, reader.bytes.byteOffset + reader.offset, 4);
  reader.offset += 4;
  return view.getUint32(0, false);
}

export function readString(reader: SshReader): Uint8Array {
  const length = readUint32(reader);
  if (reader.offset + length > reader.bytes.length) throw new Error('Truncated: string length exceeds remaining bytes.');
  const value = reader.bytes.slice(reader.offset, reader.offset + length);
  reader.offset += length;
  return value;
}

export function readText(reader: SshReader): string {
  return new TextDecoder().decode(readString(reader));
}

/** Alias for `readString` — an `mpint` shares `string`'s wire shape; the caller decides how to interpret the magnitude. */
export const readMpint = readString;

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
