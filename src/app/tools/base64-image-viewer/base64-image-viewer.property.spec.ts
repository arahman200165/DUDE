import fc from 'fast-check';
import { describe, it } from 'vitest';
import { invariant, neverThrows } from '../../../testing/property-harness';
import { encodeBytesToBase64, parseBase64Image } from './base64-image-codec';

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const pngBytesArb = fc
  .uint8Array({ minLength: 0, maxLength: 64 })
  .map((tail) => Uint8Array.from([...PNG_SIGNATURE, ...tail]));

describe('encodeBytesToBase64 / parseBase64Image round-trip property', () => {
  it('recovers the same base64 payload, MIME sniff, and byte length for arbitrary PNG-signed bytes', () => {
    invariant(
      (bytes: Uint8Array) => ({ encoded: encodeBytesToBase64(bytes, 'image/png'), byteLength: bytes.length }),
      pngBytesArb,
      ({ encoded, byteLength }) => {
        const parsed = parseBase64Image(encoded.dataUri);
        return parsed.ok && parsed.base64 === encoded.base64 && parsed.signature.mime === 'image/png' && parsed.byteLength === byteLength;
      },
    );
  });
});

describe('fuzzing', () => {
  it('parseBase64Image never throws for arbitrary text input', () => {
    neverThrows((text: string) => parseBase64Image(text), fc.string());
  });
});
