import fc from 'fast-check';
import { describe, it } from 'vitest';
import { invariant, neverThrows } from '../../../testing/property-harness';
import { dateToWeek, weekToDate } from './week-number-calc';

const pad = (n: number) => String(n).padStart(2, '0');
const isoDateArb = fc
  .record({ year: fc.integer({ min: 1900, max: 2200 }), month: fc.integer({ min: 1, max: 12 }), day: fc.integer({ min: 1, max: 28 }) })
  .map(({ year, month, day }) => `${year}-${pad(month)}-${pad(day)}`);

describe('dateToWeek -> weekToDate round-trip', () => {
  it('recovers the original date from its ISO week-year/week-number/weekday', () => {
    invariant(
      (date: string) => {
        const forward = dateToWeek(date);
        if (!forward.ok) throw new Error('expected dateToWeek to succeed');
        const backward = weekToDate({ weekYear: forward.info.weekYear, weekNumber: forward.info.weekNumber, weekday: forward.info.weekday });
        if (!backward.ok) throw new Error('expected weekToDate to succeed');
        return backward.date;
      },
      isoDateArb,
      (recovered, date) => recovered === date,
    );
  });
});

describe('dateToWeek / weekToDate fuzzing', () => {
  it('dateToWeek never throws for arbitrary strings', () => {
    neverThrows((date: string) => dateToWeek(date), fc.string());
  });

  it('weekToDate never throws for arbitrary numeric input', () => {
    neverThrows(
      ([weekYear, weekNumber, weekday]: [number, number, number]) => weekToDate({ weekYear, weekNumber, weekday }),
      fc.tuple(fc.double(), fc.double(), fc.double()),
    );
  });
});
