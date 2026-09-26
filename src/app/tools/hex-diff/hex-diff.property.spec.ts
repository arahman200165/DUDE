import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { invariant } from '../../../testing/property-harness';
import { computeByteDiff, looksLikeText } from '../../shared/utils/byte-diff';

describe('hex-diff shared utility properties', () => {
  it('covers both inputs exactly in ordered, fixed-width chunks', () => {
    invariant(
      ([left, right]: readonly [Uint8Array, Uint8Array]) => computeByteDiff(left, right),
      fc.tuple(fc.uint8Array({ maxLength: 512 }), fc.uint8Array({ maxLength: 512 })),
      (chunks, [left, right]) => {
        const expectedCount = Math.ceil(Math.max(left.length, right.length) / 16);
        expect(chunks).toHaveLength(expectedCount);
        expect(chunks.map((chunk) => chunk.offset)).toEqual(chunks.map((_, index) => index * 16));
        for (const chunk of chunks) {
          const leftPart = left.slice(chunk.offset, chunk.offset + 16);
          const rightPart = right.slice(chunk.offset, chunk.offset + 16);
          expect(chunk.leftBytes).toEqual(leftPart.length ? leftPart : null);
          expect(chunk.rightBytes).toEqual(rightPart.length ? rightPart : null);
          expect(chunk.equal).toBe(leftPart.length > 0 && leftPart.length === rightPart.length && leftPart.every((byte, index) => byte === rightPart[index]));
        }
        return true;
      },
    );
  });

  it('always marks identical files equal and identifies NUL-free prefixes as text', () => {
    invariant(
      (bytes: Uint8Array) => ({ chunks: computeByteDiff(bytes, bytes), text: looksLikeText(bytes) }),
      fc.uint8Array({ maxLength: 512 }),
      ({ chunks, text }, bytes) => {
        expect(chunks.every((chunk) => chunk.equal)).toBe(true);
        expect(text).toBe(!bytes.subarray(0, 8000).includes(0));
        return true;
      },
    );
  });
});
