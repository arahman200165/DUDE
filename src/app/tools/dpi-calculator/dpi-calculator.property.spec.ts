import fc from 'fast-check';
import { describe, it } from 'vitest';
import { neverThrows, invariant } from '../../../testing/property-harness';
import { computeDpi, computePhysicalSizeForDpi, computePixelsForDpi, fromInches, toInches, type LengthUnit } from './dpi-calculator-logic';

const unitArb: fc.Arbitrary<LengthUnit> = fc.constantFrom('in', 'cm', 'mm');
const boundedValueArb = fc.double({ noNaN: true, min: 0.01, max: 10_000 });
const boundedPixelArb = fc.integer({ min: 1, max: 100_000 });
const boundedDpiArb = fc.double({ noNaN: true, min: 1, max: 10_000 });

describe('dpi-calculator-logic property tests', () => {
  it('toInches/fromInches never throw for arbitrary finite values/units', () => {
    neverThrows(([v, unit]: readonly [number, LengthUnit]) => [toInches(v, unit), fromInches(v, unit)], fc.tuple(fc.double({ noNaN: true }), unitArb));
  });

  it('fromInches(toInches(v, unit), unit) recovers v for any unit', () => {
    invariant(
      ([v, unit]: readonly [number, LengthUnit]) => fromInches(toInches(v, unit), unit),
      fc.tuple(boundedValueArb, unitArb),
      (result, [v]) => Math.abs(result - v) < 1e-9,
    );
  });

  it('computeDpi never throws and always returns finite, non-negative DPI for positive inputs', () => {
    neverThrows(
      ({ pw, ph, w, h, unit }: { pw: number; ph: number; w: number; h: number; unit: LengthUnit }) => computeDpi(pw, ph, w, h, unit),
      fc.record({ pw: boundedPixelArb, ph: boundedPixelArb, w: boundedValueArb, h: boundedValueArb, unit: unitArb }),
      {
        assertShape: (result) => {
          const r = result as { horizontalDpi: number; verticalDpi: number };
          if (!Number.isFinite(r.horizontalDpi) || !Number.isFinite(r.verticalDpi)) throw new Error('expected finite DPI values');
          if (r.horizontalDpi < 0 || r.verticalDpi < 0) throw new Error('expected non-negative DPI for positive inputs');
        },
      },
    );
  });

  it('computePixelsForDpi and computePhysicalSizeForDpi are approximate inverses (within rounding)', () => {
    invariant(
      ({ w, h, unit, dpi }: { w: number; h: number; unit: LengthUnit; dpi: number }) => {
        const pixels = computePixelsForDpi(w, h, unit, dpi);
        return computePhysicalSizeForDpi(pixels.width, pixels.height, dpi, unit);
      },
      fc.record({ w: boundedValueArb, h: boundedValueArb, unit: unitArb, dpi: boundedDpiArb }),
      (result, { w, h, dpi, unit }) => {
        // Math.round in computePixelsForDpi can shift the physical size by up to half a pixel's
        // worth of inches; converting that half-pixel back into the target unit (mm's tolerance
        // is ~25x an inch's) accounts for that.
        const tolerance = fromInches(0.5 / dpi, unit) + 1e-6;
        return Math.abs(result.width - w) <= tolerance && Math.abs(result.height - h) <= tolerance;
      },
    );
  });
});
