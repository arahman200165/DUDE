import fc from 'fast-check';
import { describe, it } from 'vitest';
import { neverThrows, roundTrip } from "../../../../../../tests/property-harness";
import { QueryPair, buildQueryString, parseQueryString } from "@dude/tool-engine/tools/query-string/query-string-codec";

// Empty keys are dropped by buildQueryString, so the round-trip domain excludes them.
const pairArb: fc.Arbitrary<QueryPair> = fc.record({ key: fc.string({ minLength: 1 }), value: fc.string() });
const pairsArb = fc.array(pairArb, { maxLength: 8 });

describe('buildQueryString / parseQueryString round-trip', () => {
  it('recovers the original ordered key/value pairs (including duplicate keys) after building and reparsing', () => {
    roundTrip(buildQueryString, (raw) => parseQueryString(raw as string), pairsArb);
  });
});

describe('query-string-codec fuzzing', () => {
  it('parseQueryString never throws for arbitrary text', () => {
    neverThrows((raw: string) => parseQueryString(raw), fc.string(), {
      assertShape: (result) => {
        if (!Array.isArray(result)) throw new Error('expected an array of pairs');
      },
    });
  });

  it('buildQueryString never throws for arbitrary pairs', () => {
    neverThrows((pairs: readonly QueryPair[]) => buildQueryString(pairs), fc.array(fc.record({ key: fc.string(), value: fc.string() })), {
      assertShape: (result) => {
        if (typeof result !== 'string') throw new Error('expected a string');
      },
    });
  });
});
