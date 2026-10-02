import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { neverThrows } from "../../../../../../tests/property-harness";
import { decodeQrFromImageData } from './qr-decode';

const imageDataArb = fc
  .integer({ min: 1, max: 25 })
  .chain((width) =>
    fc.integer({ min: 1, max: 25 }).chain((height) =>
      fc.array(fc.integer({ min: 0, max: 255 }), { minLength: width * height * 4, maxLength: width * height * 4 }).map(
        (pixels): ImageData => ({ data: Uint8ClampedArray.from(pixels), width, height, colorSpace: 'srgb' }) as ImageData,
      ),
    ),
  );

describe('decodeQrFromImageData property', () => {
  it('never throws, and always returns null or a string payload, for arbitrary well-formed ImageData', () => {
    neverThrows((imageData: ImageData) => decodeQrFromImageData(imageData), imageDataArb, {
      assertShape: (result) => {
        if (result !== null) expect(typeof (result as { data: string }).data).toBe('string');
      },
    });
  });
});
