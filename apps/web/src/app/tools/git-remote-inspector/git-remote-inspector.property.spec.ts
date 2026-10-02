import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { neverThrows } from "../../../../../../tests/property-harness";
import { parseGitRemotes } from "@dude/tool-engine/tools/git-remote-inspector/git-remote-inspector-logic";

describe('git-remote-inspector properties', () => {
  it('never throws and always returns an array for arbitrary output', () => {
    neverThrows(parseGitRemotes, fc.string(), { assertShape: (result) => expect(Array.isArray(result)).toBe(true) });
  });
});
