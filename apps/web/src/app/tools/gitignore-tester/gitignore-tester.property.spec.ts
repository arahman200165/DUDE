import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { invariant } from "../../../../../../tests/property-harness";
import { testGitignorePaths } from "@dude/tool-engine/tools/gitignore-tester/gitignore-tester-logic";

describe('gitignore tester properties', () => {
  it('returns one result per non-empty candidate path without throwing', () => {
    invariant(([rules, paths]) => testGitignorePaths(rules, paths), fc.tuple(fc.string(), fc.array(fc.string(), { maxLength: 30 })), (result, [, paths]) => {
      expect(result).toHaveLength(paths.filter((path) => path.trim() !== '').length);
      return result.every((item) => typeof item.ignored === 'boolean');
    });
  });
});

