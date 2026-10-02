/**
 * Pure, framework-free relative-time conversion, bidirectional:
 * free text ("3 days ago", "next tuesday") -> timestamp via `chrono-node`
 * (natural-language date parsing is exactly the "genuinely fiddly" case
 * that justifies a library over hand-rolling one, per project convention);
 * timestamp -> text via the native `Intl.RelativeTimeFormat`, picking the
 * largest unit that doesn't round to zero.
 */
import * as chrono from 'chrono-node';

export type ParseTextResult =
  | { readonly ok: true; readonly dateMs: number; readonly iso: string }
  | { readonly ok: false; readonly error: string };

export function parseRelativeText(text: string, referenceMs: number): ParseTextResult {
  const trimmed = text.trim();
  if (trimmed === '') return { ok: false, error: 'Enter a relative time expression.' };

  const parsed = chrono.parseDate(trimmed, new Date(referenceMs));
  if (!parsed) return { ok: false, error: `Could not parse "${text}" as a date/time.` };

  return { ok: true, dateMs: parsed.getTime(), iso: parsed.toISOString() };
}

const RELATIVE_UNITS: readonly { readonly unit: Intl.RelativeTimeFormatUnit; readonly ms: number }[] = [
  { unit: 'year', ms: 365.25 * 24 * 60 * 60 * 1000 },
  { unit: 'month', ms: (365.25 / 12) * 24 * 60 * 60 * 1000 },
  { unit: 'week', ms: 7 * 24 * 60 * 60 * 1000 },
  { unit: 'day', ms: 24 * 60 * 60 * 1000 },
  { unit: 'hour', ms: 60 * 60 * 1000 },
  { unit: 'minute', ms: 60 * 1000 },
  { unit: 'second', ms: 1000 },
];

export type FormatTimestampResult = { readonly ok: true; readonly text: string } | { readonly ok: false; readonly error: string };

export function formatRelativeTime(targetMs: number, referenceMs: number): FormatTimestampResult {
  if (!Number.isFinite(targetMs)) return { ok: false, error: 'Enter a valid timestamp.' };

  const diffMs = targetMs - referenceMs;
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

  for (const { unit, ms } of RELATIVE_UNITS) {
    if (Math.abs(diffMs) >= ms || unit === 'second') {
      return { ok: true, text: rtf.format(Math.round(diffMs / ms), unit) };
    }
  }

  return { ok: true, text: rtf.format(0, 'second') };
}
