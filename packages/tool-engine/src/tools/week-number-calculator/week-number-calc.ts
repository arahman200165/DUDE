/**
 * Pure, framework-free ISO-8601 week-date conversion, built on luxon's
 * `DateTime` (which already implements the ISO week-date rules — week 1 is
 * the week containing the year's first Thursday, weeks run Monday-Sunday).
 */
import { DateTime, WeekdayNumbers } from 'luxon';

export interface WeekInfo {
  readonly weekYear: number;
  readonly weekNumber: number;
  readonly weekday: number;
  readonly weekdayName: string;
  readonly weeksInWeekYear: number;
  readonly isoWeekLabel: string;
}

export type DateToWeekResult = { readonly ok: true; readonly info: WeekInfo } | { readonly ok: false; readonly error: string };

export function dateToWeek(dateStr: string): DateToWeekResult {
  const trimmed = dateStr.trim();
  if (trimmed === '') return { ok: false, error: 'Enter a date.' };

  const date = DateTime.fromISO(trimmed);
  if (!date.isValid) return { ok: false, error: date.invalidExplanation ?? 'Invalid date.' };

  return { ok: true, info: buildWeekInfo(date) };
}

export interface WeekToDateInput {
  readonly weekYear: number;
  readonly weekNumber: number;
  readonly weekday: number;
}

export type WeekToDateResult =
  | { readonly ok: true; readonly date: string; readonly info: WeekInfo }
  | { readonly ok: false; readonly error: string };

export function weekToDate(input: WeekToDateInput): WeekToDateResult {
  if (!Number.isInteger(input.weekYear)) return { ok: false, error: 'Enter a valid week-year.' };
  if (!Number.isInteger(input.weekNumber) || input.weekNumber < 1 || input.weekNumber > 53) {
    return { ok: false, error: 'Week number must be between 1 and 53.' };
  }
  if (!Number.isInteger(input.weekday) || input.weekday < 1 || input.weekday > 7) {
    return { ok: false, error: 'Weekday must be between 1 (Monday) and 7 (Sunday).' };
  }

  const date = DateTime.fromObject({
    weekYear: input.weekYear,
    weekNumber: input.weekNumber,
    weekday: input.weekday as WeekdayNumbers,
  });
  if (!date.isValid) return { ok: false, error: date.invalidExplanation ?? 'That week/weekday does not exist for this week-year.' };

  return { ok: true, date: date.toISODate()!, info: buildWeekInfo(date) };
}

function buildWeekInfo(date: DateTime): WeekInfo {
  return {
    weekYear: date.weekYear,
    weekNumber: date.weekNumber,
    weekday: date.weekday,
    weekdayName: date.toFormat('cccc'),
    weeksInWeekYear: date.weeksInWeekYear,
    isoWeekLabel: `${date.weekYear}-W${String(date.weekNumber).padStart(2, '0')}`,
  };
}
