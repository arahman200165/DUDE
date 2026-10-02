/**
 * Pure, framework-free timestamp conversion used by the Unix Timestamp tool.
 *
 * Microsecond/nanosecond values are handled via BigInt rather than Number:
 * a nanosecond epoch timestamp for "now" is ~19 digits (~1.8e18), which is
 * well past Number.MAX_SAFE_INTEGER (~9.007e15) and would silently lose
 * precision under plain `Number()` arithmetic. Milliseconds (used for the
 * `Date` object itself) always stay comfortably within the safe integer
 * range for any realistic date, so only the raw large-unit values need
 * BigInt -- the `Date` math in between is unchanged.
 */
import { DateTime } from 'luxon';

export type TimestampUnit = 'auto' | 'seconds' | 'milliseconds' | 'microseconds' | 'nanoseconds';
export type NumericUnit = 'seconds' | 'milliseconds' | 'microseconds' | 'nanoseconds';
export type ResolvedUnit = NumericUnit | 'iso8601' | 'rfc2822' | 'httpdate';
export type DisplayTimezone = 'local' | 'utc';

export type TimestampParseResult =
  | { readonly ok: true; readonly date: Date; readonly resolvedUnit: ResolvedUnit }
  | { readonly ok: false; readonly error: string };

export type TimestampNumberResult = { readonly ok: true; readonly value: number | string } | { readonly ok: false; readonly error: string };

const UNIT_DIVISOR: Record<'microseconds' | 'nanoseconds', bigint> = { microseconds: 1_000n, nanoseconds: 1_000_000n };
const UNIT_MULTIPLIER: Record<'microseconds' | 'nanoseconds', bigint> = { microseconds: 1_000n, nanoseconds: 1_000_000n };

/**
 * Digit-length heuristic: each unit is ~3 digits longer than the last for a
 * present-day epoch value (10 digits for seconds, 13 for milliseconds, 16
 * for microseconds, 19 for nanoseconds).
 */
export function resolveUnit(rawValue: string, unit: TimestampUnit): NumericUnit | null {
  if (unit !== 'auto') return unit;
  const digits = rawValue.replace(/[^0-9]/g, '').length;
  if (digits === 0) return null;
  if (digits >= 19) return 'nanoseconds';
  if (digits >= 16) return 'microseconds';
  if (digits >= 13) return 'milliseconds';
  return 'seconds';
}

export function parseTimestamp(rawValue: string, unit: TimestampUnit): TimestampParseResult {
  const trimmed = rawValue.trim();
  if (trimmed === '') return { ok: false, error: 'Enter a timestamp.' };

  if (/^-?\d+$/.test(trimmed)) return parseNumericTimestamp(trimmed, unit);
  return parseDateStringTimestamp(trimmed);
}

function parseNumericTimestamp(trimmed: string, unit: TimestampUnit): TimestampParseResult {
  const resolvedUnit = resolveUnit(trimmed, unit);
  if (!resolvedUnit) return { ok: false, error: 'Enter a timestamp.' };

  const ms = numericUnitToMs(trimmed, resolvedUnit);
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return { ok: false, error: 'Timestamp is out of range.' };

  return { ok: true, date, resolvedUnit };
}

/**
 * ISO 8601 (which also covers RFC 3339, a stricter ISO 8601 profile), an HTTP-date
 * (RFC 7231 §7.1.1.1 — IMF-fixdate, or the obsolete RFC 850/asctime forms it must
 * still accept), or RFC 2822. HTTP-date is checked before RFC 2822 since a
 * GMT-suffixed IMF-fixdate string is valid under both -- it's more precisely an
 * HTTP-date, so that's the more useful label to resolve it to.
 */
function parseDateStringTimestamp(trimmed: string): TimestampParseResult {
  const iso = DateTime.fromISO(trimmed);
  if (iso.isValid) return { ok: true, date: iso.toJSDate(), resolvedUnit: 'iso8601' };

  const httpDate = DateTime.fromHTTP(trimmed);
  if (httpDate.isValid) return { ok: true, date: httpDate.toJSDate(), resolvedUnit: 'httpdate' };

  const rfc2822 = DateTime.fromRFC2822(trimmed);
  if (rfc2822.isValid) return { ok: true, date: rfc2822.toJSDate(), resolvedUnit: 'rfc2822' };

  return { ok: false, error: `Could not parse "${trimmed}" as an integer timestamp, ISO 8601, HTTP-date, or RFC 2822.` };
}

/** RFC 7231's preferred HTTP-date format (IMF-fixdate), always in GMT/UTC regardless of display timezone. */
export function toHttpDate(date: Date): string {
  return DateTime.fromJSDate(date).toUTC().toHTTP() ?? '';
}

function numericUnitToMs(rawValue: string, unit: NumericUnit): number {
  if (unit === 'seconds') return Number(rawValue) * 1000;
  if (unit === 'milliseconds') return Number(rawValue);
  return Number(BigInt(rawValue) / UNIT_DIVISOR[unit]);
}

export function dateToTimestamp(dateTimeLocalValue: string, tz: DisplayTimezone, unit: NumericUnit): TimestampNumberResult {
  if (dateTimeLocalValue.trim() === '') return { ok: false, error: 'Enter a date and time.' };

  const isoCandidate = tz === 'utc' ? `${dateTimeLocalValue}Z` : dateTimeLocalValue;
  const date = new Date(isoCandidate);
  if (Number.isNaN(date.getTime())) return { ok: false, error: 'Invalid date/time.' };

  return { ok: true, value: msToUnit(date.getTime(), unit) };
}

export function msToUnit(ms: number, unit: NumericUnit): number | string {
  if (unit === 'seconds') return Math.floor(ms / 1000);
  if (unit === 'milliseconds') return ms;
  return (BigInt(Math.round(ms)) * UNIT_MULTIPLIER[unit]).toString();
}

export function formatDate(date: Date, tz: DisplayTimezone): string {
  return tz === 'utc' ? date.toISOString() : date.toString();
}

export function toDateTimeLocalValue(date: Date, tz: DisplayTimezone): string {
  if (tz === 'utc') return date.toISOString().slice(0, 19);

  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
