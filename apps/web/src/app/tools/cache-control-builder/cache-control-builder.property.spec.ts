import fc from 'fast-check';
import { describe, it } from 'vitest';
import { invariant, neverThrows } from "../../../../../../tests/property-harness";
import {
  CacheControlEntry,
  buildCacheControl,
  checkCacheControlWarnings,
  parseCacheControl,
} from "@dude/tool-engine/tools/cache-control-builder/cache-control";

const entryArb: fc.Arbitrary<CacheControlEntry> = fc.record({
  name: fc.string(),
  value: fc.oneof(fc.constant(null), fc.string()),
});
const entriesArb = fc.array(entryArb);

describe('cache-control fuzzing', () => {
  it('parseCacheControl never throws for arbitrary text', () => {
    neverThrows((raw: string) => parseCacheControl(raw), fc.string(), {
      assertShape: (result) => {
        if (!Array.isArray(result)) throw new Error('expected an array');
      },
    });
  });

  it('buildCacheControl never throws for arbitrary entries', () => {
    neverThrows((entries: readonly CacheControlEntry[]) => buildCacheControl(entries), entriesArb, {
      assertShape: (result) => {
        if (typeof result !== 'string') throw new Error('expected a string');
      },
    });
  });

  it('checkCacheControlWarnings never throws and returns a bounded list of strings', () => {
    invariant(
      checkCacheControlWarnings,
      entriesArb,
      (result) => Array.isArray(result) && result.length <= 3 && result.every((w) => typeof w === 'string'),
    );
  });
});
