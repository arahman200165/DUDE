import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { neverThrows } from "../../../../../../tests/property-harness";
import { explainGitCommand } from "@dude/tool-engine/tools/git-command-explainer/git-command-explainer-logic";

describe('git-command-explainer properties', () => {
  it('never throws and returns token explanations for arbitrary input', () => {
    neverThrows(explainGitCommand, fc.string(), { assertShape: (result) => expect(Array.isArray(result)).toBe(true) });
  });
});
