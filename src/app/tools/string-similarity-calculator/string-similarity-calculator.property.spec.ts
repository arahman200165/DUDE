import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { invariant, neverThrows } from '../../../testing/property-harness';
import { compareStrings } from './string-similarity';

const EPSILON = 1e-9;

describe('compareStrings fuzzing', () => {
  it('never throws for arbitrary string pairs', () => {
    neverThrows(([a, b]: [string, string]) => compareStrings(a, b), fc.tuple(fc.string(), fc.string()), {
      assertShape: (result) => expect(typeof (result as { levenshteinDistance: number }).levenshteinDistance).toBe('number'),
    });
  });

  it('keeps both similarity scores within [0, 1] and the distance non-negative', () => {
    invariant(
      ([a, b]: [string, string]) => compareStrings(a, b),
      fc.tuple(fc.string(), fc.string()),
      (result) =>
        result.levenshteinDistance >= 0 &&
        result.levenshteinSimilarity >= 0 &&
        result.levenshteinSimilarity <= 1 &&
        result.jaroWinklerSimilarity >= 0 &&
        result.jaroWinklerSimilarity <= 1,
    );
  });

  it('reports zero distance and perfect similarity for a string compared with itself', () => {
    invariant(
      (a: string) => compareStrings(a, a),
      fc.string(),
      (result) => result.levenshteinDistance === 0 && result.levenshteinSimilarity === 1 && result.jaroWinklerSimilarity === 1,
    );
  });

  it('is symmetric: compareStrings(a, b) matches compareStrings(b, a)', () => {
    invariant(
      ([a, b]: [string, string]) => [compareStrings(a, b), compareStrings(b, a)] as const,
      fc.tuple(fc.string(), fc.string()),
      ([forward, backward]) =>
        forward.levenshteinDistance === backward.levenshteinDistance &&
        Math.abs(forward.levenshteinSimilarity - backward.levenshteinSimilarity) < EPSILON &&
        Math.abs(forward.jaroWinklerSimilarity - backward.jaroWinklerSimilarity) < EPSILON,
    );
  });
});
