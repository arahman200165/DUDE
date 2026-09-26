import fc from 'fast-check';
import { describe, it } from 'vitest';
import { invariant, neverThrows } from '../../../testing/property-harness';
import { computeOccurrences } from './recurrence-calc';

describe('computeOccurrences fuzzing', () => {
  it('never throws for arbitrary input', () => {
    neverThrows(
      ([startDate, startTime, ruleText, timezone, maxOccurrences]: [string, string, string, string, number]) =>
        computeOccurrences({ startDate, startTime, ruleText, timezone, maxOccurrences }),
      fc.tuple(fc.string(), fc.string(), fc.string(), fc.string(), fc.double()),
    );
  });
});

describe('computeOccurrences invariants', () => {
  it('a daily rule with COUNT=n yields min(n, maxOccurrences, 500) chronologically-increasing occurrences', () => {
    invariant(
      ([count, maxOccurrences]: [number, number]) =>
        computeOccurrences({
          startDate: '2026-01-01',
          startTime: '00:00',
          ruleText: `FREQ=DAILY;COUNT=${count}`,
          timezone: 'UTC',
          maxOccurrences,
        }),
      fc.tuple(fc.integer({ min: 1, max: 50 }), fc.integer({ min: 1, max: 100 })),
      (result, [count, maxOccurrences]) => {
        if (!result.ok) return false;
        const expectedLength = Math.min(count, maxOccurrences, 500);
        if (result.occurrences.length !== expectedLength) return false;
        for (let i = 1; i < result.occurrences.length; i++) {
          if (Date.parse(result.occurrences[i]) <= Date.parse(result.occurrences[i - 1])) return false;
        }
        return true;
      },
    );
  });
});
