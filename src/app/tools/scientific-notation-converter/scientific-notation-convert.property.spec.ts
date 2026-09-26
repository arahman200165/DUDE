import fc from 'fast-check';
import { describe, it } from 'vitest';
import { roundTrip } from '../../../testing/property-harness';
import { convertScientific } from './scientific-notation-convert';

describe('scientific notation properties', () => {
  it('round-trips finite nonzero numbers through the scientific representation', () => {
    roundTrip(
      (value: number) => {
        const result = convertScientific(String(value), 17);
        if (!result.ok) throw new Error(result.error);
        return result.value.scientific;
      },
      (encoded) => Number(encoded),
      fc.integer({ min: -1_000_000_000_000, max: 1_000_000_000_000 }).filter((value) => value !== 0),
    );
  });
});
