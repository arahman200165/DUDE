import fc from 'fast-check';
import { describe, it } from 'vitest';
import { invariant } from '../../../testing/property-harness';
import { generateRows, RANDOM_DATA_FIELDS } from './random-data-fields';

describe('random data generator properties', () => {
  it('returns dimensions matching the requested selected fields and row count', () => {
    invariant(
      ({ keys, rowCount, seed }) => generateRows({ fieldKeys: keys, rowCount, seed }),
      fc.record({ keys: fc.shuffledSubarray(RANDOM_DATA_FIELDS.map((field) => field.key), { minLength: 1, maxLength: 5 }), rowCount: fc.integer({ min: 1, max: 20 }), seed: fc.integer() }),
      (result, input) => result.ok && result.columns.length === input.keys.length && result.rows.length === input.rowCount && result.rows.every((row) => row.length === input.keys.length),
    );
  });

  it('produces identical output for the same seed', () => {
    invariant(
      ({ keys, rowCount, seed }) => [generateRows({ fieldKeys: keys, rowCount, seed }), generateRows({ fieldKeys: keys, rowCount, seed })],
      fc.record({ keys: fc.shuffledSubarray(RANDOM_DATA_FIELDS.map((field) => field.key), { minLength: 1, maxLength: 4 }), rowCount: fc.integer({ min: 1, max: 10 }), seed: fc.integer() }),
      ([first, second]) => JSON.stringify(first) === JSON.stringify(second),
    );
  });
});
