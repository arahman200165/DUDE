/**
 * Pure, framework-free duration parsing/formatting. `parse-duration` handles
 * human shorthand ("1d 2h 30m", "90s") and `humanize-duration` handles the
 * reverse; neither covers ISO 8601 duration strings ("PT1H30M"), so that one
 * direction is a small hand-rolled regex parser/formatter alongside them.
 */
import humanizeDuration from 'humanize-duration';
import parseDurationString from 'parse-duration';

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const YEAR_MS = 365.25 * DAY_MS;
const MONTH_MS = YEAR_MS / 12;
const WEEK_MS = 7 * DAY_MS;

const ISO_8601_PATTERN =
  /^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/;

export interface DurationBreakdown {
  readonly days: number;
  readonly hours: number;
  readonly minutes: number;
  readonly seconds: number;
  readonly milliseconds: number;
}

export interface DurationRepresentations {
  readonly ms: number;
  readonly human: string;
  readonly iso8601: string;
  readonly breakdown: DurationBreakdown;
}

export type ParseDurationResult =
  | { readonly ok: true; readonly result: DurationRepresentations }
  | { readonly ok: false; readonly error: string };

export function parseDuration(input: string): ParseDurationResult {
  const trimmed = input.trim();
  if (trimmed === '') {
    return { ok: false, error: 'Enter a duration.' };
  }

  const ms = /^p/i.test(trimmed) ? parseIso8601Duration(trimmed.toUpperCase()) : parseDurationString(trimmed);

  if (ms === null || ms === undefined || Number.isNaN(ms)) {
    return { ok: false, error: `Could not parse "${input}" as a duration.` };
  }

  return {
    ok: true,
    result: {
      ms,
      human: humanizeDuration(ms),
      iso8601: formatIso8601(ms),
      breakdown: toBreakdown(ms),
    },
  };
}

function parseIso8601Duration(input: string): number | null {
  const match = ISO_8601_PATTERN.exec(input);
  if (!match) return null;

  const [, years, months, weeks, days, hours, minutes, seconds] = match;
  if ([years, months, weeks, days, hours, minutes, seconds].every((value) => value === undefined)) return null;

  return (
    Number(years ?? 0) * YEAR_MS +
    Number(months ?? 0) * MONTH_MS +
    Number(weeks ?? 0) * WEEK_MS +
    Number(days ?? 0) * DAY_MS +
    Number(hours ?? 0) * HOUR_MS +
    Number(minutes ?? 0) * MINUTE_MS +
    Number(seconds ?? 0) * 1000
  );
}

function formatIso8601(ms: number): string {
  let remaining = Math.floor(ms);

  const days = Math.floor(remaining / DAY_MS);
  remaining -= days * DAY_MS;
  const hours = Math.floor(remaining / HOUR_MS);
  remaining -= hours * HOUR_MS;
  const minutes = Math.floor(remaining / MINUTE_MS);
  remaining -= minutes * MINUTE_MS;
  const seconds = remaining / 1000;

  const timeParts: string[] = [];
  if (hours) timeParts.push(`${hours}H`);
  if (minutes) timeParts.push(`${minutes}M`);
  if (seconds) timeParts.push(`${trimNumber(seconds)}S`);

  let result = 'P';
  if (days) result += `${days}D`;
  if (timeParts.length > 0) result += `T${timeParts.join('')}`;

  return result === 'P' ? 'PT0S' : result;
}

function trimNumber(value: number): string {
  return Number(value.toFixed(3)).toString();
}

function toBreakdown(ms: number): DurationBreakdown {
  let remaining = Math.floor(ms);

  const days = Math.floor(remaining / DAY_MS);
  remaining -= days * DAY_MS;
  const hours = Math.floor(remaining / HOUR_MS);
  remaining -= hours * HOUR_MS;
  const minutes = Math.floor(remaining / MINUTE_MS);
  remaining -= minutes * MINUTE_MS;
  const seconds = Math.floor(remaining / 1000);
  remaining -= seconds * 1000;

  return { days, hours, minutes, seconds, milliseconds: remaining };
}
