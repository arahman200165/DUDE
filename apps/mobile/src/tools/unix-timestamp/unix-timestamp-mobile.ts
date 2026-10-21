import type { KeyValueRow, ToolRunResult } from '../../kit';
import { formatDate, msToUnit, parseTimestamp, toHttpDate, type TimestampUnit } from '@dude/tool-engine/tools/unix-timestamp/timestamp-convert';

export const TIMESTAMP_UNITS: readonly TimestampUnit[] = ['auto', 'seconds', 'milliseconds', 'microseconds', 'nanoseconds'];

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

const plural = (count: number, unit: string): string => `${count} ${unit}${count === 1 ? '' : 's'}`;

/**
 * English relative time ("in 3 hours", "5 minutes ago"). Hermes ships `Intl.DateTimeFormat` but not reliably
 * `Intl.RelativeTimeFormat`, and the engine has no relative formatter, so this small locale-free version lives here.
 */
export function relativeTime(thenMs: number, nowMs: number): string {
  const diff = thenMs - nowMs;
  const abs = Math.abs(diff);
  if (abs < SECOND) return 'just now';
  const text = abs < MINUTE ? plural(Math.floor(abs / SECOND), 'second')
    : abs < HOUR ? plural(Math.floor(abs / MINUTE), 'minute')
      : abs < DAY ? plural(Math.floor(abs / HOUR), 'hour')
        : abs < MONTH ? plural(Math.floor(abs / DAY), 'day')
          : abs < YEAR ? plural(Math.floor(abs / MONTH), 'month')
            : plural(Math.floor(abs / YEAR), 'year');
  return diff > 0 ? `in ${text}` : `${text} ago`;
}

/** The device's IANA time zone, or null when the runtime cannot say. */
export function deviceTimeZone(): string | null {
  try { return new Intl.DateTimeFormat().resolvedOptions().timeZone || null; } catch { return null; }
}

/** Epoch value, ISO 8601, HTTP-date or RFC 2822 in; the same rows the web tool shows, plus relative time. */
export function timestampRows(input: string, unit: TimestampUnit, nowMs: number, zone: string | null = deviceTimeZone()): ToolRunResult {
  const parsed = parseTimestamp(input, unit);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const { date, resolvedUnit } = parsed;
  const rows: KeyValueRow[] = [
    { key: 'utc', label: 'UTC (ISO 8601)', value: date.toISOString() },
    { key: 'local', label: zone ? `Local time (${zone})` : 'Local time', value: formatDate(date, 'local') },
    { key: 'relative', label: 'Relative to now', value: relativeTime(date.getTime(), nowMs) },
    { key: 'seconds', label: 'Unix seconds', value: String(msToUnit(date.getTime(), 'seconds')) },
    { key: 'milliseconds', label: 'Unix milliseconds', value: String(date.getTime()) },
    { key: 'http', label: 'HTTP-date', value: toHttpDate(date) },
    { key: 'detected', label: 'Detected as', value: resolvedUnit },
  ];
  return { ok: true, output: rows };
}
