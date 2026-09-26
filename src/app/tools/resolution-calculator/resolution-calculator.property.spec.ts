import fc from 'fast-check';
import { describe, it } from 'vitest';
import { neverThrows, invariant } from '../../../testing/property-harness';
import { megapixels } from './resolution-calculator-logic';

const dimArb = fc.double({ noNaN: true, min: 0, max: 100_000 });

describe('megapixels property tests', () => {
  it('never throws for arbitrary finite dimensions', () => {
    neverThrows(([w, h]: readonly [number, number]) => megapixels(w, h), fc.tuple(fc.double({ noNaN: true }), fc.double({ noNaN: true })), {
      assertShape: (result) => {
        if (typeof result !== 'number') throw new Error('expected a number');
      },
    });
  });

  it('is commutative and equal to the exact width*height/1e6 product', () => {
    invariant(
      ([w, h]: readonly [number, number]) => [megapixels(w, h), megapixels(h, w)] as const,
      fc.tuple(dimArb, dimArb),
      ([forward, reversed], [w, h]) => forward === reversed && forward === (w * h) / 1_000_000,
    );
  });
});
