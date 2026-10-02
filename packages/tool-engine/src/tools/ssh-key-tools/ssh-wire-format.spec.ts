import { describe, expect, it } from 'vitest';
import {
  base64ToBytes,
  bitLength,
  bytesToBase64,
  concat,
  createReader,
  mpint,
  readString,
  readText,
  readUint32,
  sshString,
  sshStringFromText,
} from "./ssh-wire-format.js";

describe('ssh-wire-format', () => {
  it('encodes a string with a 4-byte big-endian length prefix', () => {
    const encoded = sshStringFromText('ssh-rsa');
    expect(encoded.length).toBe(4 + 7);
    expect(Array.from(encoded.slice(0, 4))).toEqual([0, 0, 0, 7]);
  });

  it('round-trips a string through sshString/readString', () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    const reader = createReader(sshString(bytes));
    expect(Array.from(readString(reader))).toEqual(Array.from(bytes));
  });

  it('round-trips text through sshStringFromText/readText', () => {
    const reader = createReader(sshStringFromText('nistp256'));
    expect(readText(reader)).toBe('nistp256');
  });

  it('reads a raw uint32 length prefix', () => {
    const reader = createReader(new Uint8Array([0, 0, 1, 0]));
    expect(readUint32(reader)).toBe(256);
  });

  it('mpint prepends a 0x00 byte when the high bit of the magnitude is set', () => {
    const magnitude = new Uint8Array([0xff, 0x01]);
    const encoded = mpint(magnitude);
    // length prefix (4 bytes) + 0x00 pad + original 2 bytes = 7
    expect(encoded.length).toBe(7);
    expect(Array.from(encoded.slice(4))).toEqual([0x00, 0xff, 0x01]);
  });

  it('mpint does not pad when the high bit is already clear', () => {
    const magnitude = new Uint8Array([0x7f, 0x01]);
    const encoded = mpint(magnitude);
    expect(encoded.length).toBe(6);
    expect(Array.from(encoded.slice(4))).toEqual([0x7f, 0x01]);
  });

  it('mpint strips a redundant leading zero from a minimal-length positive magnitude', () => {
    const magnitude = new Uint8Array([0x00, 0x7f]);
    const encoded = mpint(magnitude);
    expect(encoded.length).toBe(5);
    expect(Array.from(encoded.slice(4))).toEqual([0x7f]);
  });

  it('bitLength ignores leading zero bytes', () => {
    expect(bitLength(new Uint8Array([0x00, 0x00, 0xff]))).toBe(8);
    expect(bitLength(new Uint8Array([0x01, 0x00]))).toBe(9);
    expect(bitLength(new Uint8Array([0x00]))).toBe(0);
  });

  it('concat joins byte arrays in order', () => {
    const joined = concat(new Uint8Array([1, 2]), new Uint8Array([3]), new Uint8Array([4, 5]));
    expect(Array.from(joined)).toEqual([1, 2, 3, 4, 5]);
  });

  it('round-trips bytes through bytesToBase64/base64ToBytes', () => {
    const bytes = new Uint8Array([0, 1, 2, 253, 254, 255]);
    expect(Array.from(base64ToBytes(bytesToBase64(bytes)))).toEqual(Array.from(bytes));
  });
});
