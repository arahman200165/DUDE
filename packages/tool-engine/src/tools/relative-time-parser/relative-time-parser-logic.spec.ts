import { formatRelativeTime, parseRelativeText } from "./relative-time-parser-logic.js";

const REFERENCE_MS = Date.UTC(2026, 0, 15, 12, 0, 0);

describe('parseRelativeText', () => {
  it('parses "N units ago" as an offset from the reference instant', () => {
    const result = parseRelativeText('3 days ago', REFERENCE_MS);
    expect(result).toEqual({ ok: true, dateMs: REFERENCE_MS - 3 * 24 * 60 * 60 * 1000, iso: new Date(REFERENCE_MS - 3 * 24 * 60 * 60 * 1000).toISOString() });
  });

  it('parses "in N units" as an offset from the reference instant', () => {
    const result = parseRelativeText('in 2 hours', REFERENCE_MS);
    expect(result).toEqual({ ok: true, dateMs: REFERENCE_MS + 2 * 60 * 60 * 1000, iso: new Date(REFERENCE_MS + 2 * 60 * 60 * 1000).toISOString() });
  });

  it('parses "yesterday" relative to the local calendar day of the reference instant', () => {
    const expected = new Date(REFERENCE_MS);
    expected.setDate(expected.getDate() - 1);

    const result = parseRelativeText('yesterday', REFERENCE_MS);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(new Date(result.dateMs).toDateString()).toBe(expected.toDateString());
  });

  it('rejects empty input', () => {
    expect(parseRelativeText('', REFERENCE_MS)).toEqual({ ok: false, error: 'Enter a relative time expression.' });
  });

  it('rejects unparsable input', () => {
    const result = parseRelativeText('asdfghjkl', REFERENCE_MS);
    expect(result.ok).toBe(false);
  });
});

describe('formatRelativeTime', () => {
  it('formats a past instant using the largest sensible unit', () => {
    const threeDaysAgo = REFERENCE_MS - 3 * 24 * 60 * 60 * 1000;
    expect(formatRelativeTime(threeDaysAgo, REFERENCE_MS)).toEqual({ ok: true, text: '3 days ago' });
  });

  it('formats a future instant using the largest sensible unit', () => {
    const inTwoHours = REFERENCE_MS + 2 * 60 * 60 * 1000;
    expect(formatRelativeTime(inTwoHours, REFERENCE_MS)).toEqual({ ok: true, text: 'in 2 hours' });
  });

  it('falls back to seconds for a sub-minute difference', () => {
    expect(formatRelativeTime(REFERENCE_MS + 30_000, REFERENCE_MS)).toEqual({ ok: true, text: 'in 30 seconds' });
  });

  it('rejects a non-finite timestamp', () => {
    expect(formatRelativeTime(NaN, REFERENCE_MS)).toEqual({ ok: false, error: 'Enter a valid timestamp.' });
  });
});
