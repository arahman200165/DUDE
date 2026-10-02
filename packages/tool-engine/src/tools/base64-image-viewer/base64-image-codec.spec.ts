import { describe, expect, it } from 'vitest';
import { encodeBytesToBase64, parseBase64Image } from "./base64-image-codec.js";

// A 1x1 transparent PNG, well-known fixture.
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

describe('parseBase64Image', () => {
  it('rejects empty input', () => {
    const result = parseBase64Image('');
    expect(result.ok).toBe(false);
  });

  it('rejects invalid base64', () => {
    const result = parseBase64Image('not-base64!!!');
    expect(result.ok).toBe(false);
  });

  it('parses a raw base64 PNG payload and sniffs its type', () => {
    const result = parseBase64Image(PNG_BASE64);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.signature.mime).toBe('image/png');
      expect(result.dataUri).toBe(`data:image/png;base64,${PNG_BASE64}`);
    }
  });

  it('parses an already-wrapped data URI', () => {
    const result = parseBase64Image(`data:image/png;base64,${PNG_BASE64}`);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.signature.mime).toBe('image/png');
  });

  it('rejects a data URI whose bytes do not match a known image signature', () => {
    const result = parseBase64Image(`data:image/png;base64,${btoa('not an image')}`);
    expect(result.ok).toBe(false);
  });

  it('tolerates whitespace/newlines in the base64 payload', () => {
    const wrapped = PNG_BASE64.match(/.{1,20}/g)!.join('\n');
    const result = parseBase64Image(wrapped);
    expect(result.ok).toBe(true);
  });
});

describe('encodeBytesToBase64', () => {
  it('round-trips through parseBase64Image', () => {
    const bytes = Uint8Array.from(atob(PNG_BASE64), (char) => char.charCodeAt(0));
    const encoded = encodeBytesToBase64(bytes, 'image/png');
    expect(encoded.base64).toBe(PNG_BASE64);

    const parsed = parseBase64Image(encoded.dataUri);
    expect(parsed.ok).toBe(true);
  });
});
