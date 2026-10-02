import fc from 'fast-check';
import { describe, it } from 'vitest';
import { invariant, neverThrows } from "../../../../../../tests/property-harness";
import { buildAcceptHeader, parseAcceptHeader, sortByPreference } from "@dude/tool-engine/tools/accept-header-builder/accept-header";
import { KeyValuePair } from "@dude/shared-types/shared/models/key-value-pair.model";

const pairArb: fc.Arbitrary<KeyValuePair> = fc.record({ key: fc.string(), value: fc.string() });
const pairsArb = fc.array(pairArb);

/** Mirrors accept-header.ts's private qOf: empty/non-numeric q defaults to 1. */
function qOf(pair: KeyValuePair): number {
  const parsed = Number(pair.value);
  return pair.value === '' || Number.isNaN(parsed) ? 1 : parsed;
}

describe('accept-header fuzzing', () => {
  it('parseAcceptHeader never throws for arbitrary text', () => {
    neverThrows((raw: string) => parseAcceptHeader(raw), fc.string(), {
      assertShape: (result) => {
        if (!Array.isArray(result)) throw new Error('expected an array');
      },
    });
  });

  it('buildAcceptHeader never throws for arbitrary pairs', () => {
    neverThrows((pairs: readonly KeyValuePair[]) => buildAcceptHeader(pairs), pairsArb, {
      assertShape: (result) => {
        if (typeof result !== 'string') throw new Error('expected a string');
      },
    });
  });

  it('sortByPreference preserves length and orders by descending q', () => {
    invariant(
      sortByPreference,
      pairsArb,
      (result, pairs) => {
        if (result.length !== pairs.length) return false;
        for (let i = 0; i < result.length - 1; i++) {
          if (qOf(result[i]) < qOf(result[i + 1])) return false;
        }
        return true;
      },
    );
  });
});
