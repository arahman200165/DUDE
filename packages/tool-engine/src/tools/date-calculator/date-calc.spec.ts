import { addDays, daysBetween, parseHolidays } from "./date-calc.js";

describe('parseHolidays', () => {
  it('parses newline- and comma-separated ISO dates', () => {
    const holidays = parseHolidays('2026-01-01\n2026-07-04,2026-12-25');
    expect(holidays.dates).toEqual(new Set(['2026-01-01', '2026-07-04', '2026-12-25']));
  });

  it('ignores blank lines and unparsable entries', () => {
    const holidays = parseHolidays('2026-01-01\n\nnot-a-date\n');
    expect(holidays.dates).toEqual(new Set(['2026-01-01']));
  });

  it('returns an empty set for empty input', () => {
    expect(parseHolidays('').dates.size).toBe(0);
  });
});

const NO_HOLIDAYS = parseHolidays('');

describe('addDays', () => {
  it('adds calendar days', () => {
    expect(addDays({ startDate: '2026-01-01', amount: 10, mode: 'calendar', holidays: NO_HOLIDAYS })).toEqual({
      ok: true,
      resultDate: '2026-01-11',
    });
  });

  it('subtracts calendar days', () => {
    expect(addDays({ startDate: '2026-01-11', amount: -10, mode: 'calendar', holidays: NO_HOLIDAYS })).toEqual({
      ok: true,
      resultDate: '2026-01-01',
    });
  });

  it('adds business days, skipping weekends', () => {
    // 2026-01-01 is a Thursday. +1 business day -> Fri 01-02. +2 -> Mon 01-05.
    expect(addDays({ startDate: '2026-01-01', amount: 2, mode: 'business', holidays: NO_HOLIDAYS })).toEqual({
      ok: true,
      resultDate: '2026-01-05',
    });
  });

  it('adds business days, skipping a holiday', () => {
    const holidays = parseHolidays('2026-01-02');
    // Thu 01-01 +1 business day, skipping the 01-02 holiday and the weekend -> Mon 01-05.
    expect(addDays({ startDate: '2026-01-01', amount: 1, mode: 'business', holidays })).toEqual({
      ok: true,
      resultDate: '2026-01-05',
    });
  });

  it('subtracts business days', () => {
    // Mon 2026-01-05 -1 business day -> Fri 2026-01-02.
    expect(addDays({ startDate: '2026-01-05', amount: -1, mode: 'business', holidays: NO_HOLIDAYS })).toEqual({
      ok: true,
      resultDate: '2026-01-02',
    });
  });

  it('rejects an invalid start date', () => {
    expect(addDays({ startDate: 'nope', amount: 1, mode: 'calendar', holidays: NO_HOLIDAYS })).toEqual({
      ok: false,
      error: 'Enter a valid start date.',
    });
  });

  it('rejects a non-finite amount', () => {
    expect(addDays({ startDate: '2026-01-01', amount: NaN, mode: 'calendar', holidays: NO_HOLIDAYS })).toEqual({
      ok: false,
      error: 'Enter a valid number of days.',
    });
  });
});

describe('daysBetween', () => {
  it('counts total/weekday/weekend days in range', () => {
    // 2026-01-01 (Thu) through 2026-01-08 (Thu) exclusive of the end date = 7 nights.
    const result = daysBetween({ startDate: '2026-01-01', endDate: '2026-01-08', holidays: NO_HOLIDAYS });
    expect(result).toEqual({ ok: true, totalDays: 7, weekdays: 5, weekendDays: 2, businessDays: 5, holidaysInRange: 0 });
  });

  it('is order-independent', () => {
    const forward = daysBetween({ startDate: '2026-01-01', endDate: '2026-01-08', holidays: NO_HOLIDAYS });
    const backward = daysBetween({ startDate: '2026-01-08', endDate: '2026-01-01', holidays: NO_HOLIDAYS });
    expect(forward).toEqual(backward);
  });

  it('counts holidays within the range and excludes them from business days', () => {
    const holidays = parseHolidays('2026-01-05');
    const result = daysBetween({ startDate: '2026-01-01', endDate: '2026-01-08', holidays });
    expect(result).toEqual({ ok: true, totalDays: 7, weekdays: 5, weekendDays: 2, businessDays: 4, holidaysInRange: 1 });
  });

  it('returns zero for the same start and end date', () => {
    expect(daysBetween({ startDate: '2026-01-01', endDate: '2026-01-01', holidays: NO_HOLIDAYS })).toEqual({
      ok: true,
      totalDays: 0,
      weekdays: 0,
      weekendDays: 0,
      businessDays: 0,
      holidaysInRange: 0,
    });
  });

  it('rejects invalid dates', () => {
    expect(daysBetween({ startDate: 'nope', endDate: '2026-01-01', holidays: NO_HOLIDAYS })).toEqual({
      ok: false,
      error: 'Enter valid start and end dates.',
    });
  });
});
