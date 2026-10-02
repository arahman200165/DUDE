import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { invariant, neverThrows } from "../../../../../../tests/property-harness";
import { analyzeCharacters } from "@dude/tool-engine/tools/unicode-character-inspector/unicode-char-analyze";

describe('analyzeCharacters fuzzing', () => {
  it('never throws for arbitrary text', () => {
    neverThrows((text: string) => analyzeCharacters(text), fc.string({ maxLength: 3000 }), {
      assertShape: (result) => expect(Array.isArray((result as { entries: unknown[] }).entries)).toBe(true),
    });
  });

  it('reports totalCount as the true code point count, caps entries at 2000, and flags truncation consistently', () => {
    invariant(
      (text: string) => analyzeCharacters(text),
      fc.string({ maxLength: 3000 }),
      (analysis, text) => {
        const codePointCount = Array.from(text).length;
        return (
          analysis.totalCount === codePointCount &&
          analysis.entries.length === Math.min(codePointCount, 2000) &&
          analysis.truncated === codePointCount > 2000
        );
      },
    );
  });

  it('formats every entry\'s code point as a well-formed U+XXXX hex string', () => {
    invariant(
      (text: string) => analyzeCharacters(text),
      fc.string({ maxLength: 200 }),
      (analysis) => analysis.entries.every((e) => /^U\+[0-9A-F]{4,6}$/.test(e.codePointHex) && parseInt(e.codePointHex.slice(2), 16) === e.codePointDecimal),
    );
  });
});
