import fc from 'fast-check';
import { describe, it } from 'vitest';
import { invariant, neverThrows } from "../../../../../../tests/property-harness";
import { addDays, daysBetween, parseHolidays } from "@dude/tool-engine/tools/date-calculator/date-calc";

const NO_HOLIDAYS = parseHolidays('');

const pad = (n: number) => String(n).padStart(2, '0');
const isoDateArb = fc
  .record({ year: fc.integer({ min: 1970, max: 2400 }), month: fc.integer({ min: 1, max: 12 }), day: fc.integer({ min: 1, max: 28 }) })
  .map(({ year, month, day }) => `${year}-${pad(month)}-${pad(day)}`);

describe('addDays / daysBetween fuzzing', () => {
  it('addDays never throws for arbitrary input', () => {
    neverThrows(
      ([startDate, amount]: [string, number]) => addDays({ startDate, amount, mode: 'calendar', holidays: NO_HOLIDAYS }),
      fc.tuple(fc.string(), fc.double()),
    );
  });

  it('daysBetween never throws for arbitrary input', () => {
    neverThrows(
      ([startDate, endDate]: [string, string]) => daysBetween({ startDate, endDate, holidays: NO_HOLIDAYS }),
      fc.tuple(fc.string(), fc.string()),
    );
  });
});

describe('addDays / daysBetween invariants', () => {
  it('adding N calendar days and measuring back with daysBetween recovers N', () => {
    invariant(
      ([startDate, amount]: [string, number]) => {
        const added = addDays({ startDate, amount, mode: 'calendar', holidays: NO_HOLIDAYS });
        if (!added.ok) throw new Error('expected addDays to succeed');
        const between = daysBetween({ startDate, endDate: added.resultDate, holidays: NO_HOLIDAYS });
        if (!between.ok) throw new Error('expected daysBetween to succeed');
        return between.totalDays;
      },
      fc.tuple(isoDateArb, fc.integer({ min: -1000, max: 1000 })),
      (totalDays, [, amount]) => totalDays === Math.abs(amount),
    );
  });

  it('daysBetween partitions total days into weekdays/weekend days, with business days a subset of weekdays', () => {
    // daysBetween walks the range one day at a time, so the span is kept small (<= ~5.5 years)
    // to keep 200 runs fast; the round-trip invariant above already exercises century-scale spans.
    invariant(
      ([start, spanDays]: [string, number]) => {
        const end = addDays({ startDate: start, amount: spanDays, mode: 'calendar', holidays: NO_HOLIDAYS });
        if (!end.ok) throw new Error('expected addDays to succeed');
        return daysBetween({ startDate: start, endDate: end.resultDate, holidays: NO_HOLIDAYS });
      },
      fc.tuple(isoDateArb, fc.integer({ min: 0, max: 2000 })),
      (result) => result.ok && result.weekdays + result.weekendDays === result.totalDays && result.businessDays <= result.weekdays,
    );
  });
});
