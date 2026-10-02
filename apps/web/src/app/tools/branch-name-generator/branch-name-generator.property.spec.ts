import fc from 'fast-check';
import { invariant, neverThrows } from "../../../../../../tests/property-harness";
import { generateBranchName, type BranchNameOptions } from "@dude/tool-engine/tools/branch-name-generator/branch-name-generator-logic";

describe('generateBranchName properties', () => {
  const options: fc.Arbitrary<BranchNameOptions> = fc.record({ type: fc.constantFrom('feature', 'bugfix', 'hotfix', 'chore', 'release', 'none'), ticket: fc.string({ maxLength: 40 }), description: fc.string({ maxLength: 100 }), maxLength: fc.integer({ min: 1, max: 80 }) });
  it('always returns a string within a positive configured limit', () => {
    neverThrows(generateBranchName, options, { assertShape: (result) => expect(typeof result).toBe('string') });
    invariant(generateBranchName, options, (branch, opts) => branch.length <= opts.maxLength);
  });
});
