import { dateToTimestamp, formatDate, msToUnit, parseTimestamp, resolveUnit, toDateTimeLocalValue, toHttpDate } from "./timestamp-convert.js";

describe('resolveUnit', () => {
  it('auto-detects seconds for a 10-digit value', () => {
    expect(resolveUnit('1700000000', 'auto')).toBe('seconds');
  });

  it('auto-detects milliseconds for a 13-digit value', () => {
    expect(resolveUnit('1700000000000', 'auto')).toBe('milliseconds');
  });

  it('respects an explicit unit override regardless of digit count', () => {
    expect(resolveUnit('1700000000000', 'seconds')).toBe('seconds');
  });

  it('returns null for an empty value', () => {
    expect(resolveUnit('', 'auto')).toBeNull();
  });

  it('auto-detects seconds for a negative (pre-epoch) 10-digit value', () => {
    expect(resolveUnit('-1700000000', 'auto')).toBe('seconds');
  });

  it('auto-detects microseconds for a 16-digit value', () => {
    expect(resolveUnit('1700000000000000', 'auto')).toBe('microseconds');
  });

  it('auto-detects nanoseconds for a 19-digit value', () => {
    expect(resolveUnit('1700000000000000000', 'auto')).toBe('nanoseconds');
  });
});

describe('parseTimestamp', () => {
  it('parses a valid seconds timestamp', () => {
    const result = parseTimestamp('1700000000', 'auto');

    expect(result.ok).toBe(true);
    expect(result.ok && result.resolvedUnit).toBe('seconds');
    expect(result.ok && result.date.getTime()).toBe(1_700_000_000_000);
  });

  it('parses a valid milliseconds timestamp', () => {
    const result = parseTimestamp('1700000000000', 'auto');

    expect(result.ok).toBe(true);
    expect(result.ok && result.resolvedUnit).toBe('milliseconds');
  });

  it('rejects non-integer input', () => {
    expect(parseTimestamp('not-a-number', 'auto').ok).toBe(false);
  });

  it('rejects empty input', () => {
    expect(parseTimestamp('', 'auto').ok).toBe(false);
  });

  it('parses a negative (pre-epoch) timestamp', () => {
    const result = parseTimestamp('-1700000000', 'auto');

    expect(result.ok).toBe(true);
    expect(result.ok && result.resolvedUnit).toBe('seconds');
    expect(result.ok && result.date.getTime()).toBe(-1_700_000_000_000);
    expect(result.ok && result.date.getTime() < 0).toBe(true);
  });

  it('parses a microseconds timestamp without precision loss', () => {
    const result = parseTimestamp('1700000000000000', 'auto');

    expect(result.ok).toBe(true);
    expect(result.ok && result.resolvedUnit).toBe('microseconds');
    expect(result.ok && result.date.getTime()).toBe(1_700_000_000_000);
  });

  it('parses a nanoseconds timestamp without precision loss', () => {
    const result = parseTimestamp('1700000000123456789', 'auto');

    expect(result.ok).toBe(true);
    expect(result.ok && result.resolvedUnit).toBe('nanoseconds');
    expect(result.ok && result.date.getTime()).toBe(1_700_000_000_123);
  });

  it('parses an ISO 8601 date string', () => {
    const result = parseTimestamp('2023-11-14T22:13:20Z', 'auto');

    expect(result.ok).toBe(true);
    expect(result.ok && result.resolvedUnit).toBe('iso8601');
    expect(result.ok && result.date.getTime()).toBe(1_700_000_000_000);
  });

  it('parses an RFC 2822 date string with a numeric UTC offset', () => {
    const result = parseTimestamp('Tue, 14 Nov 2023 22:13:20 +0000', 'auto');

    expect(result.ok).toBe(true);
    expect(result.ok && result.resolvedUnit).toBe('rfc2822');
    expect(result.ok && result.date.getTime()).toBe(1_700_000_000_000);
  });

  it('resolves a GMT-suffixed IMF-fixdate string as an HTTP-date (valid RFC 2822 too, but HTTP-date is the more precise label)', () => {
    const result = parseTimestamp('Tue, 14 Nov 2023 22:13:20 GMT', 'auto');

    expect(result.ok).toBe(true);
    expect(result.ok && result.resolvedUnit).toBe('httpdate');
    expect(result.ok && result.date.getTime()).toBe(1_700_000_000_000);
  });

  it('parses the obsolete RFC 850 HTTP-date form', () => {
    const result = parseTimestamp('Tuesday, 14-Nov-23 22:13:20 GMT', 'auto');

    expect(result.ok).toBe(true);
    expect(result.ok && result.resolvedUnit).toBe('httpdate');
    expect(result.ok && result.date.getTime()).toBe(1_700_000_000_000);
  });

  it('parses the obsolete asctime HTTP-date form', () => {
    const result = parseTimestamp('Tue Nov 14 22:13:20 2023', 'auto');

    expect(result.ok).toBe(true);
    expect(result.ok && result.resolvedUnit).toBe('httpdate');
    expect(result.ok && result.date.getTime()).toBe(1_700_000_000_000);
  });

  it('rejects a string that is neither an integer, ISO 8601, HTTP-date, nor RFC 2822', () => {
    expect(parseTimestamp('not-a-timestamp', 'auto').ok).toBe(false);
  });
});

describe('toHttpDate', () => {
  it('formats a date as RFC 7231 IMF-fixdate, always in GMT', () => {
    expect(toHttpDate(new Date(1_700_000_000_000))).toBe('Tue, 14 Nov 2023 22:13:20 GMT');
  });
});

describe('dateToTimestamp', () => {
  it('converts a UTC date/time string to a seconds timestamp', () => {
    expect(dateToTimestamp('2023-11-14T22:13:20', 'utc', 'seconds')).toEqual({ ok: true, value: 1_700_000_000 });
  });

  it('converts a UTC date/time string to a milliseconds timestamp', () => {
    expect(dateToTimestamp('2023-11-14T22:13:20', 'utc', 'milliseconds')).toEqual({
      ok: true,
      value: 1_700_000_000_000,
    });
  });

  it('rejects an empty value', () => {
    expect(dateToTimestamp('', 'utc', 'seconds').ok).toBe(false);
  });

  it('rejects an unparseable date/time', () => {
    expect(dateToTimestamp('not-a-date', 'utc', 'seconds').ok).toBe(false);
  });

  it('converts a UTC date/time string to a microseconds timestamp', () => {
    expect(dateToTimestamp('2023-11-14T22:13:20', 'utc', 'microseconds')).toEqual({ ok: true, value: '1700000000000000' });
  });

  it('converts a UTC date/time string to a nanoseconds timestamp', () => {
    expect(dateToTimestamp('2023-11-14T22:13:20', 'utc', 'nanoseconds')).toEqual({ ok: true, value: '1700000000000000000' });
  });
});

describe('msToUnit', () => {
  it('converts to each unit', () => {
    const ms = 1_700_000_000_000;
    expect(msToUnit(ms, 'seconds')).toBe(1_700_000_000);
    expect(msToUnit(ms, 'milliseconds')).toBe(1_700_000_000_000);
    expect(msToUnit(ms, 'microseconds')).toBe('1700000000000000');
    expect(msToUnit(ms, 'nanoseconds')).toBe('1700000000000000000');
  });
});

describe('formatDate', () => {
  it('formats as ISO 8601 for UTC', () => {
    expect(formatDate(new Date(1_700_000_000_000), 'utc')).toBe('2023-11-14T22:13:20.000Z');
  });
});

describe('toDateTimeLocalValue', () => {
  it('formats a UTC date as a datetime-local value', () => {
    expect(toDateTimeLocalValue(new Date(1_700_000_000_000), 'utc')).toBe('2023-11-14T22:13:20');
  });
});
