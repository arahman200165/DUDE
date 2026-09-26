import fc from 'fast-check';
import { describe, it } from 'vitest';
import { invariant, neverThrows } from '../../../testing/property-harness';
import { checkContrast, contrastRatio } from './contrast-checker-logic';

function toHex2(n: number): string {
  return n.toString(16).padStart(2, '0');
}

const hexArb = fc
  .tuple(fc.integer({ min: 0, max: 255 }), fc.integer({ min: 0, max: 255 }), fc.integer({ min: 0, max: 255 }))
  .map(([r, g, b]) => `#${toHex2(r)}${toHex2(g)}${toHex2(b)}`);

describe('contrastRatio property', () => {
  it('is always between 1:1 and 21:1 for arbitrary color pairs', () => {
    invariant(
      ([fg, bg]: [string, string]) => contrastRatio(fg, bg),
      fc.tuple(hexArb, hexArb),
      (ratio) => ratio >= 1 && ratio <= 21.000001,
    );
  });

  it('is symmetric regardless of argument order', () => {
    invariant(
      ([fg, bg]: [string, string]) => [contrastRatio(fg, bg), contrastRatio(bg, fg)] as const,
      fc.tuple(hexArb, hexArb),
      ([a, b]) => Math.abs(a - b) < 1e-9,
    );
  });
});

describe('fuzzing', () => {
  it('checkContrast never throws for arbitrary text input', () => {
    neverThrows(([fg, bg]: [string, string]) => checkContrast(fg, bg), fc.tuple(fc.string(), fc.string()));
  });
});
