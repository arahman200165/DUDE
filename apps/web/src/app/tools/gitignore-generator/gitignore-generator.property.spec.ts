import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { neverThrows } from "../../../../../../tests/property-harness";
import { combineGitignoreTemplates } from "@dude/tool-engine/tools/gitignore-generator/gitignore-generator-logic";

describe('gitignore generator properties', () => {
  it('never throws for arbitrary template ids and returns text', () => {
    neverThrows(combineGitignoreTemplates, fc.array(fc.string(), { maxLength: 30 }), {
      assertShape: (result) => expect(typeof result).toBe('string'),
    });
  });
});
