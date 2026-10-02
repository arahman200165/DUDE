import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { neverThrows } from "../../../../../../tests/property-harness";
import { generateJsonPatch } from "@dude/tool-engine/tools/json-patch-generate/json-patch-generate-transform";

describe('JSON Patch generator properties', () => {
  it('returns a patch array for JSON document pairs', () => {
    neverThrows(([before, after]: [unknown, unknown]) => generateJsonPatch(JSON.stringify(before), JSON.stringify(after)),
      fc.tuple(fc.dictionary(fc.string(), fc.jsonValue()), fc.dictionary(fc.string(), fc.jsonValue())), {
        assertShape: (result) => {
          expect((result as { ok: boolean }).ok).toBe(true);
          expect(Array.isArray(JSON.parse((result as { output: string }).output))).toBe(true);
        },
      });
  });
});
