import fc from 'fast-check';
import { decodeBase64, encodeBase64 } from './base64-codec';

describe('encodeBase64', () => {
  it('encodes plain ASCII text', () => {
    expect(encodeBase64('hello')).toEqual({ ok: true, value: 'aGVsbG8=' });
  });

  it('encodes empty text to an empty string', () => {
    expect(encodeBase64('')).toEqual({ ok: true, value: '' });
  });

  it('is UTF-8 safe for multi-byte characters', () => {
    const result = encodeBase64('café 😀');
    expect(result.ok).toBe(true);
    expect(result.ok && decodeBase64(result.value)).toEqual({ ok: true, value: 'café 😀' });
  });
});

describe('decodeBase64', () => {
  it('decodes a valid Base64 string back to text', () => {
    expect(decodeBase64('aGVsbG8=')).toEqual({ ok: true, value: 'hello' });
  });

  it('reports an error for invalid Base64 characters', () => {
    const result = decodeBase64('not-valid-base64!!!');
    expect(result.ok).toBe(false);
  });

  it('reports an error for Base64 that decodes to invalid UTF-8', () => {
    const result = decodeBase64('/w==');
    expect(result.ok).toBe(false);
  });
});

describe('round-trip property (DUDE_PRD.md §21 Phase 23 Item 4)', () => {
  it('decodeBase64(encodeBase64(x)) === x for any well-formed Unicode text', () => {
    fc.assert(
      fc.property(fc.string(), (text) => {
        const encoded = encodeBase64(text);
        expect(encoded.ok).toBe(true);
        if (!encoded.ok) return;
        const decoded = decodeBase64(encoded.value);
        expect(decoded).toEqual({ ok: true, value: text });
      }),
    );
  });
});
