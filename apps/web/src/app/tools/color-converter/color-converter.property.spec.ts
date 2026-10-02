import fc from 'fast-check';
import { describe, it } from 'vitest';
import { neverThrows, roundTrip } from "../../../../../../tests/property-harness";
import { parseColor } from "@dude/tool-engine/tools/color-converter/color-convert";

function toHex2(n: number): string {
  return n.toString(16).padStart(2, '0');
}

const hexArb = fc
  .tuple(fc.integer({ min: 0, max: 255 }), fc.integer({ min: 0, max: 255 }), fc.integer({ min: 0, max: 255 }))
  .map(([r, g, b]) => `#${toHex2(r)}${toHex2(g)}${toHex2(b)}`);

describe('parseColor round-trip property (canonical hex is a fixed point)', () => {
  it('parseColor(hex).formats.hex === hex for arbitrary canonical hex colors', () => {
    roundTrip(
      (hex: string) => hex,
      (hex) => {
        const result = parseColor(hex as string);
        if (!result.ok) throw new Error(`expected ${String(hex)} to parse`);
        return result.formats.hex;
      },
      hexArb,
    );
  });

  it('parseColor(rgb(r, g, b)).formats.hex matches the same triple\'s canonical hex', () => {
    roundTrip(
      (hex: string) => {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgb(${r}, ${g}, ${b})`;
      },
      (rgbString) => {
        const result = parseColor(rgbString as string);
        if (!result.ok) throw new Error(`expected ${String(rgbString)} to parse`);
        return result.formats.hex;
      },
      hexArb,
    );
  });
});

describe('fuzzing', () => {
  it('parseColor never throws for arbitrary text input', () => {
    neverThrows((text: string) => parseColor(text), fc.string());
  });
});
