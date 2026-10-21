import { describe, expect, it } from 'vitest';
import { relativeTime, timestampRows } from './unix-timestamp-mobile';

const value = (result: ReturnType<typeof timestampRows>, key: string): string | undefined =>
  result.ok && Array.isArray(result.output) ? result.output.find(row => row.key === key)?.value : undefined;

describe('relativeTime', () => {
  const now = Date.UTC(2026, 0, 1);
  it('describes the past and the future', () => {
    expect(relativeTime(now - 5 * 60_000, now)).toBe('5 minutes ago');
    expect(relativeTime(now + 3 * 3_600_000, now)).toBe('in 3 hours');
    expect(relativeTime(now - 86_400_000, now)).toBe('1 day ago');
    expect(relativeTime(now + 45_000, now)).toBe('in 45 seconds');
  });
  it('rolls over to months and years', () => {
    expect(relativeTime(now - 60 * 86_400_000, now)).toBe('2 months ago');
    expect(relativeTime(now + 800 * 86_400_000, now)).toBe('in 2 years');
  });
  it('treats sub-second differences as now', () => {
    expect(relativeTime(now + 400, now)).toBe('just now');
  });
});

describe('timestampRows', () => {
  const now = 1_700_000_000_000 + 2 * 3_600_000;
  it('auto-detects seconds and fills every row (timestamp-convert.spec.ts:35)', () => {
    const result = timestampRows('1700000000', 'auto', now, 'UTC');
    expect(value(result, 'utc')).toBe('2023-11-14T22:13:20.000Z');
    expect(value(result, 'seconds')).toBe('1700000000');
    expect(value(result, 'milliseconds')).toBe('1700000000000');
    expect(value(result, 'relative')).toBe('2 hours ago');
    expect(value(result, 'detected')).toBe('seconds');
    expect(value(result, 'http')).toBe('Tue, 14 Nov 2023 22:13:20 GMT');
  });
  it('auto-detects milliseconds and ISO 8601', () => {
    expect(value(timestampRows('1700000000000', 'auto', now), 'detected')).toBe('milliseconds');
    expect(value(timestampRows('2023-11-14T22:13:20Z', 'auto', now), 'milliseconds')).toBe('1700000000000');
  });
  it('treats zero as the epoch', () => {
    expect(value(timestampRows('0', 'auto', now), 'utc')).toBe('1970-01-01T00:00:00.000Z');
  });
  it('reports bad input', () => {
    expect(timestampRows('not-a-number', 'auto', now).ok).toBe(false);
  });
});
