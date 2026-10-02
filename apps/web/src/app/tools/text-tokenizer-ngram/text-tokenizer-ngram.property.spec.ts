import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { invariant, neverThrows } from "../../../../../../tests/property-harness";
import { NGramLevel, TokenGranularity, generateNGrams, tokenize } from "@dude/tool-engine/tools/text-tokenizer-ngram/text-tokenizer-ngram-logic";

const granularityArb = fc.constantFrom<TokenGranularity>('word', 'sentence');
const levelArb = fc.constantFrom<NGramLevel>('word', 'char');

describe('tokenize fuzzing', () => {
  it('never throws for arbitrary text and granularity', () => {
    neverThrows(([text, granularity]: [string, TokenGranularity]) => tokenize(text, granularity), fc.tuple(fc.string(), granularityArb), {
      assertShape: (result) => expect(Array.isArray(result)).toBe(true),
    });
  });

  it('segments partition the text exactly: concatenating every segment recovers the original', () => {
    invariant(
      ([text, granularity]: [string, TokenGranularity]) => tokenize(text, granularity),
      fc.tuple(fc.string(), granularityArb),
      (tokens, [text]) => tokens.map((t) => t.text).join('') === text,
    );
  });
});

describe('generateNGrams fuzzing', () => {
  it('never throws for arbitrary text, level, and n', () => {
    neverThrows(
      ([text, level, n]: [string, NGramLevel, number]) => generateNGrams(text, level, n),
      fc.tuple(fc.string(), levelArb, fc.integer({ min: -5, max: 20 })),
      { assertShape: (result) => expect(Array.isArray(result)).toBe(true) },
    );
  });

  it('every count is positive, and counts sum to exactly the number of sliding windows scanned', () => {
    invariant(
      ([text, level, size]: [string, NGramLevel, number]) => {
        const unitCount = level === 'word' ? tokenize(text, 'word').filter((t) => t.isWordLike).length : Array.from(text).length;
        const expectedWindows = unitCount >= size ? unitCount - size + 1 : 0;
        const entries = generateNGrams(text, level, size);
        return { entries, expectedWindows };
      },
      fc.tuple(fc.string(), levelArb, fc.integer({ min: 1, max: 20 })),
      ({ entries, expectedWindows }) => entries.every((e) => e.count >= 1) && entries.reduce((sum, e) => sum + e.count, 0) === expectedWindows,
    );
  });
});
