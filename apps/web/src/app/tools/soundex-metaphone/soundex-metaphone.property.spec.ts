import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { invariant, neverThrows } from "../../../../../../tests/property-harness";
import { generatePhoneticCodes } from "@dude/tool-engine/tools/soundex-metaphone/soundex-metaphone-generate";

describe('generatePhoneticCodes fuzzing', () => {
  it('never throws for arbitrary bulk input', () => {
    neverThrows((rawInput: string) => generatePhoneticCodes(rawInput), fc.string(), {
      assertShape: (result) => expect(Array.isArray(result)).toBe(true),
    });
  });

  it('produces exactly one entry per non-empty, trimmed newline/comma-separated token', () => {
    invariant(
      (rawInput: string) => generatePhoneticCodes(rawInput),
      fc.string(),
      (entries, rawInput) => {
        const expectedWords = rawInput
          .split(/[\n,]+/)
          .map((w) => w.trim())
          .filter((w) => w !== '');
        return entries.length === expectedWords.length && entries.every((e, i) => e.word === expectedWords[i]);
      },
    );
  });
});
