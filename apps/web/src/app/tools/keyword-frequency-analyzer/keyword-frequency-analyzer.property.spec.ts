import fc from 'fast-check';
import { describe, it } from 'vitest';
import { invariant, neverThrows } from "../../../../../../tests/property-harness";
import { computeKeywordFrequency, KeywordFrequencyOptions } from "@dude/tool-engine/tools/keyword-frequency-analyzer/keyword-frequency";

const optionsArb = fc.record({
  ignoreStopWords: fc.boolean(),
  minLength: fc.integer({ min: 0, max: 10 }),
  caseSensitive: fc.boolean(),
});

describe('keyword-frequency-analyzer fuzzing', () => {
  it('never throws for arbitrary text/options', () => {
    neverThrows(([text, options]: [string, KeywordFrequencyOptions]) => computeKeywordFrequency(text, options), fc.tuple(fc.string(), optionsArb));
  });

  it('every reported word meets the minimum length and appears at least once', () => {
    invariant(
      ([text, options]: [string, KeywordFrequencyOptions]) => computeKeywordFrequency(text, options),
      fc.tuple(fc.string(), optionsArb),
      (entries, [, options]) => entries.every((entry) => entry.count >= 1 && entry.word.length >= options.minLength),
    );
  });

  it('is sorted by descending count', () => {
    invariant(
      ([text, options]: [string, KeywordFrequencyOptions]) => computeKeywordFrequency(text, options),
      fc.tuple(fc.string(), optionsArb),
      (entries) => entries.every((entry, index) => index === 0 || entries[index - 1].count >= entry.count),
    );
  });
});
