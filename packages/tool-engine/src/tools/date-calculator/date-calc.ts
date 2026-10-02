import { DateTime } from 'luxon';

export interface HolidaySet {
  readonly dates: ReadonlySet<string>;
}

/** Parses one ISO date per line or comma, tolerant of blank lines and unparsable entries. */
export function parseHolidays(text: string): HolidaySet {
  const dates = new Set<string>();
  for (const raw of text.split(/[\n,]/)) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const parsed = DateTime.fromISO(trimmed);
    if (parsed.isValid) dates.add(parsed.toISODate()!);
  }
  return { dates };
}

function isBusinessDay(date: DateTime, holidays: HolidaySet): boolean {
  return date.weekday <= 5 && !holidays.dates.has(date.toISODate()!);
}

export type AddMode = 'calendar' | 'business';

export interface AddDaysInput {
  readonly startDate: string;
  readonly amount: number;
  readonly mode: AddMode;
  readonly holidays: HolidaySet;
}

export type AddDaysResult = { readonly ok: true; readonly resultDate: string } | { readonly ok: false; readonly error: string };

export function addDays(input: AddDaysInput): AddDaysResult {
  const start = DateTime.fromISO(input.startDate);
  if (!start.isValid) return { ok: false, error: 'Enter a valid start date.' };
  if (!Number.isFinite(input.amount)) return { ok: false, error: 'Enter a valid number of days.' };

  if (input.mode === 'calendar') {
    return { ok: true, resultDate: start.plus({ days: Math.trunc(input.amount) }).toISODate()! };
  }

  const step = input.amount >= 0 ? 1 : -1;
  let remaining = Math.abs(Math.trunc(input.amount));
  let current = start;
  while (remaining > 0) {
    current = current.plus({ days: step });
    if (isBusinessDay(current, input.holidays)) remaining--;
  }
  return { ok: true, resultDate: current.toISODate()! };
}

export interface DaysBetweenInput {
  readonly startDate: string;
  readonly endDate: string;
  readonly holidays: HolidaySet;
}

export type DaysBetweenResult =
  | {
      readonly ok: true;
      readonly totalDays: number;
      readonly weekdays: number;
      readonly weekendDays: number;
      readonly businessDays: number;
      readonly holidaysInRange: number;
    }
  | { readonly ok: false; readonly error: string };

/** Counts full days in [start, end) — i.e. the number of nights between the two dates. */
export function daysBetween(input: DaysBetweenInput): DaysBetweenResult {
  const start = DateTime.fromISO(input.startDate);
  const end = DateTime.fromISO(input.endDate);
  if (!start.isValid || !end.isValid) return { ok: false, error: 'Enter valid start and end dates.' };

  const from = start.toMillis() <= end.toMillis() ? start : end;
  const to = start.toMillis() <= end.toMillis() ? end : start;

  let totalDays = 0;
  let weekdays = 0;
  let weekendDays = 0;
  let businessDays = 0;
  let holidaysInRange = 0;

  let cursor = from;
  while (cursor.toMillis() < to.toMillis()) {
    totalDays++;
    if (cursor.weekday <= 5) weekdays++;
    else weekendDays++;
    if (input.holidays.dates.has(cursor.toISODate()!)) holidaysInRange++;
    if (isBusinessDay(cursor, input.holidays)) businessDays++;
    cursor = cursor.plus({ days: 1 });
  }

  return { ok: true, totalDays, weekdays, weekendDays, businessDays, holidaysInRange };
}
