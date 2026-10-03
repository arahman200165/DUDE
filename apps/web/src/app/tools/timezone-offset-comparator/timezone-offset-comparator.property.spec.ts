import fc from 'fast-check';
import { describe, it } from 'vitest';
import { invariant, neverThrows } from "../../../../../../tests/property-harness";
import { buildOffsetGrid, comparePairwise } from "@dude/tool-engine/tools/timezone-offset-comparator/timezone-offset-comparator-logic";

const zoneArb = fc.constantFrom('America/New_York', 'Europe/London', 'Asia/Tokyo', 'Australia/Sydney', 'UTC', 'Asia/Kolkata');

describe('buildOffsetGrid / comparePairwise fuzzing', () => {
  it('buildOffsetGrid never throws for arbitrary zones/year', () => {
    neverThrows(
      ([zones, year]: [readonly string[], number]) => buildOffsetGrid({ zones, year }),
      fc.tuple(fc.array(fc.string(), { maxLength: 5 }), fc.double()),
    );
  });

  it('comparePairwise never throws for arbitrary input', () => {
    neverThrows(
      ([zoneA, zoneB, atMs]: [string, string, number]) => comparePairwise({ zoneA, zoneB, atMs }),
      fc.tuple(fc.string(), fc.string(), fc.double()),
    );
  });
});

describe('buildOffsetGrid invariants', () => {
  it('produces 12 well-formed monthly offsets per zone', () => {
    invariant(
      ([zones, year]: [readonly string[], number]) => buildOffsetGrid({ zones, year }),
      fc.tuple(fc.array(zoneArb, { minLength: 1, maxLength: 4 }), fc.integer({ min: 1990, max: 2060 })),
      (result) =>
        result.ok &&
        result.rows.every((row) => row.monthlyOffsets.length === 12 && row.monthlyOffsets.every((offset) => /^[+-]\d{2}:\d{2}$/.test(offset))),
    );
  });
});

describe('comparePairwise invariants', () => {
  // Each run does two comparePairwise calls, each searching for the next DST transition via
  // luxon -- legitimately slow enough (not a bug) that 200 runs can exceed vitest's default 5s
  // test timeout under parallel-suite CPU contention, so this test gets its own longer timeout.
  it(
    'is antisymmetric: swapping zones negates the gap',
    () => {
      invariant(
        ([zoneA, zoneB, atMs]: [string, string, number]) => {
          const ab = comparePairwise({ zoneA, zoneB, atMs });
          const ba = comparePairwise({ zoneA: zoneB, zoneB: zoneA, atMs });
          if (!ab.ok || !ba.ok) throw new Error('expected both comparisons to succeed');
          return { gapAB: ab.result.gapMinutes, gapBA: ba.result.gapMinutes };
        },
        fc.tuple(zoneArb, zoneArb, fc.integer({ min: Date.UTC(1990, 0, 1), max: Date.UTC(2060, 0, 1) })),
        ({ gapAB, gapBA }) => gapAB === -gapBA,
      );
    },
    // ~5 s alone; 24 s was measured in the full suite on the Windows release runner.
    60000,
  );
});
