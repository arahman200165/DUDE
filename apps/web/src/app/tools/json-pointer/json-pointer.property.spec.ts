import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { neverThrows } from "../../../../../../tests/property-harness";
import { resolveJsonPointer } from "@dude/tool-engine/tools/json-pointer/json-pointer-transform";

describe('JSON Pointer properties', () => {
  it('never throws for arbitrary JSON text and pointer strings', () => {
    neverThrows(([json, pointer]: [string, string]) => resolveJsonPointer(json, pointer), fc.tuple(fc.string(), fc.string()), {
      assertShape: (result) => expect(typeof result).toBe('object'),
    });
  });
});
