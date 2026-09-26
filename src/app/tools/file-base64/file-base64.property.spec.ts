import fc from 'fast-check';
import { describe, it } from 'vitest';
import { invariant, neverThrows, roundTrip } from '../../../testing/property-harness';
import { decodeBase64ToBytes, encodeFileToBase64 } from './file-base64-codec';
import { sniffFileType } from './file-signature';

const bytesArrayArb = fc.array(fc.integer({ min: 0, max: 255 }), { minLength: 0, maxLength: 256 });

describe('encodeFileToBase64 / decodeBase64ToBytes round-trip property', () => {
  it('decodeBase64ToBytes(encodeFileToBase64(bytes)) recovers the original bytes for arbitrary binary input', () => {
    roundTrip(
      (bytes: number[]) => encodeFileToBase64(Uint8Array.from(bytes).buffer),
      (base64) => {
        const result = decodeBase64ToBytes(base64 as string);
        if (!result.ok) throw new Error('expected valid base64 to decode');
        return Array.from(result.bytes);
      },
      bytesArrayArb,
    );
  });
});

describe('sniffFileType property', () => {
  it('never throws for arbitrary bytes', () => {
    neverThrows((bytes: Uint8Array) => sniffFileType(bytes), fc.uint8Array({ minLength: 0, maxLength: 64 }));
  });

  it('recognizes the PNG signature regardless of trailing bytes', () => {
    invariant(
      (tail: number[]) => sniffFileType(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...tail])),
      fc.array(fc.integer({ min: 0, max: 255 }), { minLength: 0, maxLength: 32 }),
      (signature) => signature !== null && signature.mime === 'image/png',
    );
  });
});
