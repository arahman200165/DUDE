import { dateToWeek, weekToDate } from "./week-number-calc.js";

describe('dateToWeek', () => {
  it('computes the ISO week for a date in the middle of a week', () => {
    // 2026-01-01 is a Thursday, so it falls in ISO week 1 of 2026.
    expect(dateToWeek('2026-01-01')).toEqual({
      ok: true,
      info: { weekYear: 2026, weekNumber: 1, weekday: 4, weekdayName: 'Thursday', weeksInWeekYear: 53, isoWeekLabel: '2026-W01' },
    });
  });

  it('assigns early-January dates to the previous ISO week-year when appropriate', () => {
    // 2027-01-01 is a Friday; ISO week-years can differ from the calendar year at the boundary.
    const result = dateToWeek('2027-01-01');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.info.weekYear).toBe(2026);
  });

  it('rejects an empty date', () => {
    expect(dateToWeek('')).toEqual({ ok: false, error: 'Enter a date.' });
  });

  it('rejects an invalid date', () => {
    const result = dateToWeek('not-a-date');
    expect(result.ok).toBe(false);
  });
});

describe('weekToDate', () => {
  it('resolves week 1, weekday 4 of 2026 back to 2026-01-01', () => {
    const result = weekToDate({ weekYear: 2026, weekNumber: 1, weekday: 4 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.date).toBe('2026-01-01');
  });

  it('round-trips with dateToWeek', () => {
    const forward = dateToWeek('2026-07-04');
    expect(forward.ok).toBe(true);
    if (!forward.ok) return;
    const backward = weekToDate({ weekYear: forward.info.weekYear, weekNumber: forward.info.weekNumber, weekday: forward.info.weekday });
    expect(backward).toEqual({ ok: true, date: '2026-07-04', info: forward.info });
  });

  it('rejects an out-of-range week number', () => {
    expect(weekToDate({ weekYear: 2026, weekNumber: 54, weekday: 1 })).toEqual({
      ok: false,
      error: 'Week number must be between 1 and 53.',
    });
  });

  it('rejects an out-of-range weekday', () => {
    expect(weekToDate({ weekYear: 2026, weekNumber: 1, weekday: 8 })).toEqual({
      ok: false,
      error: 'Weekday must be between 1 (Monday) and 7 (Sunday).',
    });
  });

  it('rejects week 53 for a year that only has 52 ISO weeks', () => {
    // 2027 is a common ISO week-year (52 weeks) since 2026-12-31 (Thu) starts week 53 of 2026 instead.
    const result = weekToDate({ weekYear: 2027, weekNumber: 53, weekday: 1 });
    expect(result.ok).toBe(false);
  });
});
