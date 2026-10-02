import { describe, expect, it } from 'vitest';
import {
  binaryStringToBytes,
  bytesToBinaryString,
  bytesToHex,
  bytesToHexSpaced,
  bytesToTextAscii,
  bytesToTextUtf16,
  bytesToTextUtf8,
  hexToBytes,
  textToBytesAscii,
  textToBytesUtf16,
  textToBytesUtf8,
} from "./byte-codec.js";

describe('bytesToHexSpaced', () => {
  it('formats bytes as space-separated lowercase hex', () => {
    expect(bytesToHexSpaced(new Uint8Array([0, 255, 16]))).toBe('00 ff 10');
  });

  it('returns an empty string for no bytes', () => {
    expect(bytesToHexSpaced(new Uint8Array())).toBe('');
  });
});

describe('bytesToHex / hexToBytes', () => {
  it('round-trips arbitrary bytes', () => {
    const bytes = new Uint8Array([0, 1, 15, 16, 255]);
    expect(bytesToHex(bytes)).toBe('00010f10ff');

    const parsed = hexToBytes('00010f10ff');
    expect(parsed.ok && Array.from(parsed.value)).toEqual([0, 1, 15, 16, 255]);
  });

  it('tolerates whitespace and colon separators', () => {
    const parsed = hexToBytes('de:ad be-ef');
    expect(parsed.ok && Array.from(parsed.value)).toEqual([0xde, 0xad, 0xbe, 0xef]);
  });

  it('rejects odd-length and non-hex input', () => {
    expect(hexToBytes('abc').ok).toBe(false);
    expect(hexToBytes('zz').ok).toBe(false);
    expect(hexToBytes('').ok).toBe(false);
  });
});

describe('bytesToBinaryString / binaryStringToBytes', () => {
  it('round-trips bytes as space-separated 8-bit groups', () => {
    const bytes = new Uint8Array([0, 255, 170]);
    expect(bytesToBinaryString(bytes)).toBe('00000000 11111111 10101010');

    const parsed = binaryStringToBytes('00000000 11111111 10101010');
    expect(parsed.ok && Array.from(parsed.value)).toEqual([0, 255, 170]);
  });

  it('rejects a group with non-binary digits', () => {
    expect(binaryStringToBytes('0000000 2').ok).toBe(false);
  });
});

describe('UTF-8 helpers', () => {
  it('round-trips multi-byte characters', () => {
    const bytes = textToBytesUtf8('héllo 🎉');
    const decoded = bytesToTextUtf8(bytes);
    expect(decoded).toEqual({ ok: true, value: 'héllo 🎉' });
  });

  it('rejects invalid UTF-8', () => {
    expect(bytesToTextUtf8(new Uint8Array([0xff, 0xfe])).ok).toBe(false);
  });
});

describe('ASCII helpers', () => {
  it('round-trips plain ASCII', () => {
    const parsed = textToBytesAscii('Hello!');
    expect(parsed.ok && bytesToTextAscii(parsed.value)).toEqual({ ok: true, value: 'Hello!' });
  });

  it('rejects non-ASCII input in both directions', () => {
    expect(textToBytesAscii('é').ok).toBe(false);
    expect(bytesToTextAscii(new Uint8Array([200])).ok).toBe(false);
  });
});

describe('UTF-16 helpers', () => {
  it('round-trips through little-endian bytes', () => {
    const bytes = textToBytesUtf16('AB', 'LE');
    expect(Array.from(bytes)).toEqual([0x41, 0x00, 0x42, 0x00]);
    expect(bytesToTextUtf16(bytes, 'LE')).toEqual({ ok: true, value: 'AB' });
  });

  it('round-trips through big-endian bytes', () => {
    const bytes = textToBytesUtf16('AB', 'BE');
    expect(Array.from(bytes)).toEqual([0x00, 0x41, 0x00, 0x42]);
    expect(bytesToTextUtf16(bytes, 'BE')).toEqual({ ok: true, value: 'AB' });
  });

  it('rejects an odd-length byte array', () => {
    expect(bytesToTextUtf16(new Uint8Array([0x41]), 'LE').ok).toBe(false);
  });
});
