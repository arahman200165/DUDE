import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { invariant, neverThrows } from '../../../testing/property-harness';
import { percentOf, percentChange, simplifyRatio } from './percentage-ratio';

describe('percentage ratio properties', () => {
  it('keeps finite percent-of inputs finite or returns a result shape', () => {
    neverThrows(([percent, of]: [number, number]) => percentOf(percent, of), fc.tuple(fc.double(), fc.double()), {
      assertShape: (result) => expect(result).toHaveProperty('ok'),
    });
  });

  it('simplifies integer ratios to an equivalent ratio', () => {
    invariant(
      ([a, b]: [bigint, bigint]) => simplifyRatio(a, b),
      fc.tuple(fc.bigInt({ min: -(10n ** 30n), max: 10n ** 30n }), fc.bigInt({ min: -(10n ** 30n), max: 10n ** 30n })).filter(([a, b]) => a !== 0n || b !== 0n),
      (result, [a, b]) => result.ok && result.value.a * b === result.value.b * a,
    );
  });

  it('does not throw for arbitrary percentage changes', () => {
    neverThrows(([from, to]: [number, number]) => percentChange(from, to), fc.tuple(fc.double(), fc.double()));
  });
});
