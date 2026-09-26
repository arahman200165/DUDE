import fc from 'fast-check';
import { describe, it } from 'vitest';
import { invariant, neverThrows } from '../../../testing/property-harness';
import { samplePixel } from './pixel-sample';

describe('samplePixel properties', () => {
  it('returns only in-bounds samples with byte channels', () => {
    invariant(
      ({ width, height, values, x, y }) => samplePixel({ width, height, data: new Uint8ClampedArray(values) } as ImageData, x, y),
      fc.record({ width: fc.integer({ min: 1, max: 20 }), height: fc.integer({ min: 1, max: 20 }), values: fc.array(fc.integer({ min: 0, max: 255 }), { minLength: 4, maxLength: 1600 }), x: fc.integer({ min: 0, max: 19 }), y: fc.integer({ min: 0, max: 19 }) }).filter(({ width, height, values }) => values.length === width * height * 4),
      (pixel, input) => input.x >= input.width || input.y >= input.height ? pixel === null : pixel !== null && Object.values(pixel).every((channel) => channel >= 0 && channel <= 255),
    );
  });

  it('never throws on arbitrary coordinates or image dimensions', () => {
    neverThrows(({ width, height, x, y }) => samplePixel({ width, height, data: new Uint8ClampedArray(Math.max(0, width * height * 4)) } as ImageData, x, y), fc.record({ width: fc.integer({ min: 0, max: 8 }), height: fc.integer({ min: 0, max: 8 }), x: fc.double(), y: fc.double() }));
  });
});
