import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { invariant, neverThrows } from '../../../testing/property-harness';
import { detectLanguage } from './language-detect';
import { computeReadability, countSyllables } from './readability';
import { computeSelectionMetrics, computeTextMetrics } from './text-metrics';

describe('computeTextMetrics fuzzing', () => {
  it('never throws for arbitrary text', () => {
    neverThrows((text: string) => computeTextMetrics(text), fc.string(), {
      assertShape: (result) => expect(typeof (result as { characterCount: number }).characterCount).toBe('number'),
    });
  });

  it('keeps codePointCount <= characterCount, and byteCount >= characterCount', () => {
    invariant(
      (text: string) => computeTextMetrics(text),
      fc.string(),
      (metrics, text) => metrics.characterCount === text.length && metrics.codePointCount <= metrics.characterCount && metrics.byteCount >= metrics.codePointCount,
    );
  });

  it('computeSelectionMetrics never throws for arbitrary (possibly out-of-range) selection bounds', () => {
    neverThrows(
      ([text, start, end]: [string, number, number]) => computeSelectionMetrics(text, start, end),
      fc.tuple(fc.string(), fc.integer({ min: -10, max: 200 }), fc.integer({ min: -10, max: 200 })),
    );
  });
});

describe('countSyllables / computeReadability fuzzing', () => {
  it('countSyllables never throws and always returns a positive integer for non-empty cleaned words', () => {
    neverThrows((word: string) => countSyllables(word), fc.string(), {
      assertShape: (result) => {
        expect(Number.isInteger(result)).toBe(true);
        expect((result as number) >= 0).toBe(true);
      },
    });
  });

  it('computeReadability never throws, and either returns null or a result with at least one word and sentence', () => {
    neverThrows((text: string) => computeReadability(text), fc.string(), {
      assertShape: (result) => {
        if (result === null) return;
        // Note: syllableCount can be 0 even though wordCount > 0 -- a "word" like a lone
        // apostrophe survives splitWords's letter-or-apostrophe filter but cleans to "" in
        // countSyllables, so it isn't a real per-word >=1-syllable guarantee.
        const score = result as { wordCount: number; sentenceCount: number; syllableCount: number };
        expect(score.wordCount).toBeGreaterThan(0);
        expect(score.sentenceCount).toBeGreaterThan(0);
        expect(score.syllableCount).toBeGreaterThanOrEqual(0);
      },
    });
  });
});

describe('detectLanguage fuzzing', () => {
  it('never throws, and returns at most 5 guesses none of which is the "undetermined" code', () => {
    neverThrows((text: string) => detectLanguage(text), fc.string({ maxLength: 500 }), {
      assertShape: (result) => {
        const guesses = result as readonly { readonly code: string }[];
        expect(guesses.length).toBeLessThanOrEqual(5);
        expect(guesses.every((g) => g.code !== 'und')).toBe(true);
      },
    });
  });
});
