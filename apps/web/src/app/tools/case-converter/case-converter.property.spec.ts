import fc from 'fast-check';
import { describe, it } from 'vitest';
import { neverThrows, roundTrip } from "../../../../../../tests/property-harness";
import { CaseStyle, convertCase, tokenize } from "@dude/tool-engine/tools/case-converter/case-convert";

// convertCase(tokenize(...)) has no single natural inverse, but tokenize/convertCase form a
// round-trip pair for every style except 'alternating': convertCase joins already-lowercase,
// letter-led word tokens back together using that style's delimiter/casing convention, and
// tokenize's delimiter + case-boundary rules recover exactly the same token list. 'alternating'
// injects case transitions mid-word that tokenize's boundary regex mistakes for new words, so it
// is exercised only by the fuzz (never-throws) property below.
const ROUND_TRIP_STYLES: readonly CaseStyle[] = ['camel', 'pascal', 'snake', 'kebab', 'constant', 'title', 'sentence', 'dot', 'path'];

// Letters-only, 2+ chars: a single-letter word capitalizes to a single uppercase letter, which
// tokenize's acronym-vs-boundary heuristic can't tell apart from a real acronym once concatenated
// with a neighboring capitalized word (e.g. words ['a', 'a'] -> "aAA" for camelCase, which
// tokenize reads back as ['a', 'aa']); a digit at a case boundary has the same "digit-then-upper
// looks like a new word" ambiguity for CONSTANT_CASE. Both are inherent to the heuristic, not
// bugs -- excluded from the round-trip arbitrary here.
const wordArb = fc.stringMatching(/^[a-z]{2,8}$/);
const wordsArb = fc.array(wordArb, { minLength: 1, maxLength: 6 });

describe('tokenize / convertCase round-trip property', () => {
  for (const style of ROUND_TRIP_STYLES) {
    it(`tokenize(convertCase(words, '${style}')) recovers the original word list`, () => {
      roundTrip(
        (words: readonly string[]) => convertCase(words.join(' '), style),
        (converted) => tokenize(converted as string),
        wordsArb,
      );
    });
  }
});

describe('convertCase fuzzing', () => {
  it('never throws for arbitrary text and any style', () => {
    const styleArb = fc.constantFrom<CaseStyle>('camel', 'pascal', 'snake', 'kebab', 'constant', 'title', 'sentence', 'dot', 'path', 'alternating');
    neverThrows(([text, style]: [string, CaseStyle]) => convertCase(text, style), fc.tuple(fc.string(), styleArb));
  });
});
