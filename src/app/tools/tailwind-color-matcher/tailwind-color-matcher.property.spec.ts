import fc from 'fast-check';
import { describe, it } from 'vitest';
import { invariant, neverThrows } from '../../../testing/property-harness';
import { findClosestTailwindColors } from './tailwind-color-matcher-logic';

function toHex2(n: number): string {
  return n.toString(16).padStart(2, '0');
}

const hexArb = fc
  .tuple(fc.integer({ min: 0, max: 255 }), fc.integer({ min: 0, max: 255 }), fc.integer({ min: 0, max: 255 }))
  .map(([r, g, b]) => `#${toHex2(r)}${toHex2(g)}${toHex2(b)}`);

const limitArb = fc.integer({ min: 1, max: 10 });

describe('findClosestTailwindColors property', () => {
  it('returns exactly `limit` matches, ranked by non-decreasing distance, with well-formed classNames, across the color space', () => {
    invariant(
      ([hex, limit]: [string, number]) => findClosestTailwindColors(hex, limit),
      fc.tuple(hexArb, limitArb),
      (result, [, limit]) => {
        if (!result.ok || result.matches.length !== limit) return false;
        for (let i = 1; i < result.matches.length; i++) {
          if (result.matches[i].distance < result.matches[i - 1].distance) return false;
        }
        return result.matches.every((match) => /^[a-z]+-\d+$/.test(match.className) && /^oklch\(/.test(match.css));
      },
    );
  });

  it('is deterministic — the same color and limit always produce the same ranked matches', () => {
    invariant(
      ([hex, limit]: [string, number]) => [findClosestTailwindColors(hex, limit), findClosestTailwindColors(hex, limit)] as const,
      fc.tuple(hexArb, limitArb),
      ([a, b]) => JSON.stringify(a) === JSON.stringify(b),
    );
  });
});

describe('fuzzing', () => {
  it('findClosestTailwindColors never throws for arbitrary text input', () => {
    neverThrows(([input, limit]: [string, number]) => findClosestTailwindColors(input, limit), fc.tuple(fc.string(), limitArb));
  });
});
