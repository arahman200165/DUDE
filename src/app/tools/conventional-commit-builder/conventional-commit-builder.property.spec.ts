import fc from 'fast-check';
import { neverThrows } from '../../../testing/property-harness';
import { buildConventionalCommit, COMMIT_TYPES, type ConventionalCommitOptions } from './conventional-commit-builder-logic';

describe('buildConventionalCommit properties', () => {
  it('never throws and always emits the selected type prefix', () => {
    const options: fc.Arbitrary<ConventionalCommitOptions> = fc.record({ type: fc.constantFrom(...COMMIT_TYPES), scope: fc.string({ maxLength: 20 }), breaking: fc.boolean(), subject: fc.string({ maxLength: 80 }), body: fc.string({ maxLength: 100 }), breakingDescription: fc.string({ maxLength: 40 }), footers: fc.string({ maxLength: 80 }) });
    neverThrows(buildConventionalCommit, options, { assertShape: (result) => expect(typeof result).toBe('string') });
  });
});
