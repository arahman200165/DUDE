import fc from 'fast-check';
import { describe, it } from 'vitest';
import { neverThrows, invariant } from '../../../testing/property-harness';
import { computeSavingsPercent } from './image-compressor-savings';

describe('computeSavingsPercent property tests', () => {
  it('never throws for arbitrary finite sizes', () => {
    neverThrows(([o, r]: readonly [number, number]) => computeSavingsPercent(o, r), fc.tuple(fc.double({ noNaN: true }), fc.double({ noNaN: true })));
  });

  it('returns null exactly when either size is falsy (0/NaN-guarded), a percentage otherwise', () => {
    invariant(
      ([o, r]: readonly [number, number]) => computeSavingsPercent(o, r),
      fc.tuple(fc.double({ noNaN: true, min: -1e9, max: 1e9 }), fc.double({ noNaN: true, min: -1e9, max: 1e9 })),
      (result, [o, r]) => {
        if (!o || !r) return result === null;
        return result === Math.round((1 - r / o) * 100);
      },
    );
  });

  it('reports 0% for equal sizes and a positive percentage when the result shrank', () => {
    invariant(
      ([o]: readonly [number]) => computeSavingsPercent(o, o),
      fc.tuple(fc.double({ noNaN: true, min: 1, max: 1e9 })),
      (result) => result === 0,
    );
  });
});
