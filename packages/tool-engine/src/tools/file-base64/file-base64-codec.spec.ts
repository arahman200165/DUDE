import { decodeBase64ToBytes, encodeFileToBase64 } from "./file-base64-codec.js";

describe('encodeFileToBase64', () => {
  it('encodes plain ASCII bytes', () => {
    const buffer = new TextEncoder().encode('abc').buffer;
    expect(encodeFileToBase64(buffer)).toBe(btoa('abc'));
  });

  it('encodes an empty buffer to an empty string', () => {
    expect(encodeFileToBase64(new ArrayBuffer(0))).toBe('');
  });

  it('round-trips arbitrary non-UTF-8 byte sequences', () => {
    const bytes = new Uint8Array([0xff, 0xfe, 0x00, 0x80, 0x7f]);
    const encoded = encodeFileToBase64(bytes.buffer);
    const decoded = decodeBase64ToBytes(encoded);

    expect(decoded.ok).toBe(true);
    expect(decoded.ok && Array.from(decoded.bytes)).toEqual(Array.from(bytes));
  });
});

describe('decodeBase64ToBytes', () => {
  it('decodes valid Base64 back into the original bytes', () => {
    const result = decodeBase64ToBytes(btoa('hello'));
    expect(result.ok).toBe(true);
    expect(result.ok && new TextDecoder().decode(result.bytes)).toBe('hello');
  });

  it('tolerates surrounding whitespace', () => {
    const result = decodeBase64ToBytes(`\n${btoa('hello')}\n`);
    expect(result.ok).toBe(true);
  });

  it('returns an error result for invalid Base64', () => {
    const result = decodeBase64ToBytes('not-valid-base64!!!');
    expect(result).toEqual({ ok: false, error: 'Invalid Base64 input.' });
  });

  it('does not reject byte sequences that are not valid UTF-8 (unlike the text codec)', () => {
    const invalidUtf8 = Uint8Array.from([0xff, 0xfe]);
    const encoded = btoa(String.fromCharCode(...invalidUtf8));

    const result = decodeBase64ToBytes(encoded);

    expect(result.ok).toBe(true);
    expect(result.ok && Array.from(result.bytes)).toEqual([0xff, 0xfe]);
  });
});
