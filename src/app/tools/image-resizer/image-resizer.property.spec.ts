import fc from 'fast-check';
import { describe, it } from 'vitest';
import { neverThrows, invariant } from '../../../testing/property-harness';
import { computeResizedDimensions, type ResizeInput, type ResizeOutput } from './resize-dimensions';

// Real dimensions always come from integer pixel counts (bitmap.width/height, or an integer
// text-field entry) -- never fractional -- so the arbitrary sticks to integers.
const dimArb = fc.integer({ min: 1, max: 20_000 });

const percentInputArb: fc.Arbitrary<ResizeInput> = fc.record({
  originalWidth: dimArb,
  originalHeight: dimArb,
  mode: fc.constant('percent'),
  percent: fc.double({ noNaN: true, min: -1000, max: 1000 }),
  lockAspect: fc.boolean(),
});

const dimensionsInputArb: fc.Arbitrary<ResizeInput> = fc.record({
  originalWidth: dimArb,
  originalHeight: dimArb,
  mode: fc.constant('dimensions'),
  targetWidth: fc.option(dimArb, { nil: undefined }),
  targetHeight: fc.option(dimArb, { nil: undefined }),
  lockAspect: fc.boolean(),
});

const anyInputArb = fc.oneof(percentInputArb, dimensionsInputArb);

describe('computeResizedDimensions property tests', () => {
  it('never throws and always returns non-negative integer dimensions', () => {
    neverThrows(computeResizedDimensions, anyInputArb, {
      assertShape: (result) => {
        const r = result as ResizeOutput;
        if (!Number.isInteger(r.width) || !Number.isInteger(r.height)) throw new Error('expected integer dimensions');
        if (r.width < 0 || r.height < 0) throw new Error('expected non-negative dimensions');
      },
    });
  });

  it('returns 0x0 exactly when the original size is non-positive', () => {
    const nonPositiveArb: fc.Arbitrary<ResizeInput> = fc.record({
      originalWidth: fc.double({ noNaN: true, min: -1000, max: 0 }),
      originalHeight: dimArb,
      mode: fc.constant('percent'),
      percent: fc.double({ noNaN: true, min: 1, max: 500 }),
      lockAspect: fc.boolean(),
    });
    invariant(computeResizedDimensions, nonPositiveArb, (result) => result.width === 0 && result.height === 0);
  });

  it('percent mode always scales both dimensions by the same factor (at least 1%)', () => {
    invariant(computeResizedDimensions, percentInputArb, (result, input) => {
      const percent = Math.max(1, input.percent ?? 100);
      return (
        result.width === Math.max(1, Math.round((input.originalWidth * percent) / 100)) &&
        result.height === Math.max(1, Math.round((input.originalHeight * percent) / 100))
      );
    });
  });

  it('aspect-locked dimensions mode preserves the original aspect ratio (within rounding)', () => {
    const lockedWithWidthArb: fc.Arbitrary<ResizeInput> = fc.record({
      originalWidth: dimArb,
      originalHeight: dimArb,
      mode: fc.constant('dimensions'),
      targetWidth: dimArb,
      lockAspect: fc.constant(true),
    });
    invariant(computeResizedDimensions, lockedWithWidthArb, (result, input) => {
      const expectedHeight = Math.max(1, Math.round(input.targetWidth! / (input.originalWidth / input.originalHeight)));
      return result.width === Math.max(1, Math.round(input.targetWidth!)) && result.height === expectedHeight;
    });
  });
});
