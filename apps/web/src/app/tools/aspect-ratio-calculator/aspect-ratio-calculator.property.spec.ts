import fc from 'fast-check';
import { describe, it } from 'vitest';
import { neverThrows, invariant } from "../../../../../../tests/property-harness";
import { parseRatio, simplifyRatio, solveHeightForRatio, solveWidthForRatio } from "@dude/tool-engine/shared/utils/aspect-ratio";

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

describe('simplifyRatio property tests', () => {
  it('never throws for arbitrary finite numbers', () => {
    neverThrows(([w, h]: readonly [number, number]) => simplifyRatio(w, h), fc.tuple(fc.double({ noNaN: true }), fc.double({ noNaN: true })), {
      assertShape: (result) => {
        if (typeof result !== 'string') throw new Error('expected a string');
      },
    });
  });

  // Realistic usage is positive integer pixel dimensions (the tool parses "WIDTHxHEIGHT" text);
  // this stays >=1 to avoid a shared aspect-ratio.ts edge case where both dimensions round to 0
  // (sub-1 fractional inputs) and produce "Infinity:Infinity" -- out of scope here since fixing
  // it would touch shared code (see RECIPE.md's flagging rule; flagged in the ledger).
  const pixelDimArb = fc.integer({ min: 1, max: 1_000_000 });

  it('reduces positive integer dimensions to a coprime "W:H" ratio', () => {
    invariant(([w, h]: readonly [number, number]) => simplifyRatio(w, h), fc.tuple(pixelDimArb, pixelDimArb), (result, [w, h]) => {
      const match = result.match(/^(\d+):(\d+)$/);
      if (!match) return false;
      const rw = Number(match[1]);
      const rh = Number(match[2]);
      return gcd(rw, rh) === 1 && rw * h === rh * w;
    });
  });
});

describe('parseRatio property tests', () => {
  it('never throws for arbitrary text', () => {
    neverThrows(parseRatio, fc.string({ maxLength: 100 }));
  });

  const ratioNumberArb = fc.double({ noNaN: true, min: 0, max: 100_000, noDefaultInfinity: true }).map((n) => Math.round(n * 100) / 100);
  const separatorArb = fc.constantFrom(':', '/');

  it('parses a synthesized "W:H" / "W/H" string back to its exact width/height', () => {
    invariant(
      ({ w, h, sep }: { w: number; h: number; sep: string }) => parseRatio(`${w}${sep}${h}`),
      fc.record({ w: ratioNumberArb, h: ratioNumberArb, sep: separatorArb }),
      (result, { w, h }) => result !== null && result.width === w && result.height === h,
    );
  });
});

describe('solveWidthForRatio / solveHeightForRatio property tests', () => {
  const positiveArb = fc.double({ noNaN: true, min: 0.01, max: 100_000 });

  it('never throw for arbitrary finite numbers', () => {
    neverThrows(([a, b, c]: readonly [number, number, number]) => [solveWidthForRatio(a, b, c), solveHeightForRatio(a, b, c)], fc.tuple(fc.double({ noNaN: true }), fc.double({ noNaN: true }), fc.double({ noNaN: true })));
  });

  it('are inverses of each other for a fixed positive ratio', () => {
    invariant(
      ({ width, ratioWidth, ratioHeight }: { width: number; ratioWidth: number; ratioHeight: number }) => {
        const height = solveHeightForRatio(width, ratioWidth, ratioHeight);
        return solveWidthForRatio(height, ratioWidth, ratioHeight);
      },
      fc.record({ width: positiveArb, ratioWidth: positiveArb, ratioHeight: positiveArb }),
      (recoveredWidth, { width }) => Math.abs(recoveredWidth - width) < 1e-6,
    );
  });
});
