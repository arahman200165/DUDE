import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { invariant } from '../../../testing/property-harness';
import { generateCuids, isValidCuid } from './cuid-logic';

describe('CUID generator properties', () => {
  it('generates the requested number of valid identifiers at the selected length', () => {
    invariant(
      ({ count, length }) => generateCuids(count, length),
      fc.record({ count: fc.integer({ min: 1, max: 20 }), length: fc.integer({ min: 2, max: 32 }) }),
      (result, options) => result.ok && result.values.length === options.count && result.values.every((value) => value.length === options.length && isValidCuid(value)),
    );
  });
});
