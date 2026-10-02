import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { neverThrows } from "../../../../../../tests/property-harness";
import { matchPaths } from "@dude/tool-engine/tools/glob-tester/glob-match";

describe('glob tester properties', () => {
  it('returns a result or error for arbitrary patterns and paths', () => {
    neverThrows(([pattern, paths]) => matchPaths(pattern, paths, { dot: true, nocase: false, treatBackslashAsSeparator: false }), fc.tuple(fc.string(), fc.array(fc.string(), { maxLength: 20 })), {
      assertShape: (result) => expect(result).toHaveProperty('ok'),
    });
  });
});
