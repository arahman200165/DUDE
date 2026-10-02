import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { neverThrows } from "../../../../../../tests/property-harness";
import { diffEnvFiles } from "@dude/tool-engine/tools/env-diff/env-diff-logic";

describe('.env diff properties', () => {
  it('returns a diff for arbitrary text pairs', () => {
    neverThrows(([before, after]) => diffEnvFiles(before, after), fc.tuple(fc.string(), fc.string()), {
      assertShape: (result) => expect(result).toBeTypeOf('object'),
    });
  });
});
