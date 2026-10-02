import fc from 'fast-check';
import { describe, it } from 'vitest';
import { invariant, neverThrows } from "../../../../../../tests/property-harness";
import { ASCII_ART_FONTS } from "@dude/tool-engine/tools/ascii-art-generator/ascii-art-fonts";
import { renderAsciiArt } from "@dude/tool-engine/tools/ascii-art-generator/ascii-art-render";

const fontArb = fc.constantFrom(...ASCII_ART_FONTS);
const textArb = fc.stringMatching(/^[A-Za-z0-9 ]{1,10}$/);

describe('renderAsciiArt fuzzing', () => {
  it('never throws for arbitrary text and any known font', () => {
    neverThrows(([text, font]: [string, string]) => renderAsciiArt(text, font), fc.tuple(fc.string(), fontArb));
  });

  it('is deterministic: the same text/font always renders the same output', () => {
    invariant(
      ([text, font]: [string, string]) => [renderAsciiArt(text, font), renderAsciiArt(text, font)] as const,
      fc.tuple(textArb, fontArb),
      ([first, second]) => first === second,
    );
  });

  it('renders non-blank text as non-empty, multi-line output across the whole font list', () => {
    invariant(
      ([text, font]: [string, string]) => renderAsciiArt(text, font),
      fc.tuple(textArb.filter((text) => text.trim() !== ''), fontArb),
      (result) => result.length > 0 && result.includes('\n'),
    );
  });
});
