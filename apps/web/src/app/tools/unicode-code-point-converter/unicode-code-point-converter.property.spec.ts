import fc from 'fast-check';
import { describe, it } from 'vitest';
import { invariant, neverThrows, roundTrip } from "../../../../../../tests/property-harness";
import { formatCodePoint, parseBulkCodePoints, parseCodePointInput } from "@dude/tool-engine/tools/unicode-code-point-converter/code-point-convert";

// Valid Unicode scalar values exclude the surrogate range (lone surrogates aren't real code points,
// and String.fromCodePoint/TextEncoder treat them specially rather than as an assigned character).
const codePointArb = fc.oneof(fc.integer({ min: 0, max: 0xd7ff }), fc.integer({ min: 0xe000, max: 0x10ffff }));

describe('formatCodePoint / parseCodePointInput round-trip', () => {
  it('parseCodePointInput(formatCodePoint(cp).uPlus) recovers cp', () => {
    roundTrip((cp: number) => formatCodePoint(cp).uPlus, (notation) => parseCodePointInput(notation as string) as number, codePointArb);
  });

  it('every notation formatCodePoint produces parses back to the same code point', () => {
    invariant(
      (cp: number) => formatCodePoint(cp),
      codePointArb,
      (notations) =>
        [notations.uPlus, notations.decimal, notations.htmlDecimal, notations.htmlHex, notations.jsEscape].every(
          (notation) => parseCodePointInput(notation) === notations.codePoint,
        ),
    );
  });
});

describe('parseCodePointInput / parseBulkCodePoints fuzzing', () => {
  it('never throws for arbitrary single-token input', () => {
    neverThrows((input: string) => parseCodePointInput(input), fc.string());
  });

  it('never throws for arbitrary bulk input', () => {
    neverThrows((input: string) => parseBulkCodePoints(input), fc.string());
  });
});
