import fc from 'fast-check';
import { describe, it } from 'vitest';
import { invariant, neverThrows } from "../../../../../../tests/property-harness";
import { generatePalette, type PaletteType } from "@dude/tool-engine/tools/palette-generator/palette-generator-logic";

function toHex2(n: number): string {
  return n.toString(16).padStart(2, '0');
}

const hexArb = fc
  .tuple(fc.integer({ min: 0, max: 255 }), fc.integer({ min: 0, max: 255 }), fc.integer({ min: 0, max: 255 }))
  .map(([r, g, b]) => `#${toHex2(r)}${toHex2(g)}${toHex2(b)}`);

const paletteTypeArb = fc.constantFrom<PaletteType>('complementary', 'split-complementary', 'analogous', 'triadic', 'tetradic', 'monochromatic');

const EXPECTED_LENGTH: Record<PaletteType, number> = {
  complementary: 2,
  'split-complementary': 3,
  analogous: 3,
  triadic: 3,
  tetradic: 4,
  monochromatic: 5,
};

describe('generatePalette property', () => {
  it('returns the expected count of well-formed hex colors for every palette type, across the color space', () => {
    invariant(
      ([hex, type]: [string, PaletteType]) => generatePalette(hex, type),
      fc.tuple(hexArb, paletteTypeArb),
      (result, [, type]) => result.ok && result.colors.length === EXPECTED_LENGTH[type] && result.colors.every((color) => /^#[0-9a-f]{6}$/.test(color)),
    );
  });

  it('is deterministic — the same base color and type always produce the same palette', () => {
    invariant(
      ([hex, type]: [string, PaletteType]) => [generatePalette(hex, type), generatePalette(hex, type)] as const,
      fc.tuple(hexArb, paletteTypeArb),
      ([a, b]) => JSON.stringify(a) === JSON.stringify(b),
    );
  });
});

describe('fuzzing', () => {
  it('generatePalette never throws for arbitrary text input', () => {
    neverThrows(([input, type]: [string, PaletteType]) => generatePalette(input, type), fc.tuple(fc.string(), paletteTypeArb));
  });
});
