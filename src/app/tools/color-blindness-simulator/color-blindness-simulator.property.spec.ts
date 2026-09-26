import fc from 'fast-check';
import { describe, it } from 'vitest';
import { invariant, neverThrows } from '../../../testing/property-harness';
import { simulateColorBlindness, type ColorBlindnessType } from './color-blindness-simulator-logic';

const typeArb = fc.constantFrom<ColorBlindnessType>('protanopia', 'deuteranopia', 'tritanopia');

const rgbaArb = fc
  .integer({ min: 1, max: 10 })
  .chain((pixelCount) => fc.array(fc.integer({ min: 0, max: 255 }), { minLength: pixelCount * 4, maxLength: pixelCount * 4 }));

describe('simulateColorBlindness property', () => {
  it('preserves array length and every alpha channel, for arbitrary pixel buffers and deficiency types', () => {
    invariant(
      ([rgba, type]: [number[], ColorBlindnessType]) => simulateColorBlindness(Uint8ClampedArray.from(rgba), type),
      fc.tuple(rgbaArb, typeArb),
      (out, [rgba]) => {
        if (out.length !== rgba.length) return false;
        for (let i = 3; i < rgba.length; i += 4) {
          if (out[i] !== rgba[i]) return false;
        }
        return true;
      },
    );
  });

  it('never throws for arbitrary pixel buffers and deficiency types', () => {
    neverThrows(([rgba, type]: [number[], ColorBlindnessType]) => simulateColorBlindness(Uint8ClampedArray.from(rgba), type), fc.tuple(rgbaArb, typeArb));
  });
});
