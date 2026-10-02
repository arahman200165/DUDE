import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { neverThrows } from "../../../../../../tests/property-harness";
import { testJsonPatch } from "@dude/tool-engine/tools/json-patch-test/json-patch-test-transform";

describe('JSON Patch tester properties', () => {
  it('never throws for arbitrary document and patch text', () => {
    neverThrows(([document, patch]: [string, string]) => testJsonPatch(document, patch), fc.tuple(fc.string(), fc.string()), {
      assertShape: (result) => expect(typeof result).toBe('object'),
    });
  });
});
