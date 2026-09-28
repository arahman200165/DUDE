import { describe, expect, it } from 'vitest';
import { addLocalDays, localDayKey, localDaysBetween, parseLocalDay } from './local-day';

describe('local-day helpers', () => {
  it('formats the local calendar day, zero-padded', () => {
    expect(localDayKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(localDayKey(new Date(2026, 11, 31, 0, 0))).toBe('2026-12-31');
  });

  it('parses valid keys and rejects malformed or impossible dates', () => {
    expect(parseLocalDay('2026-02-28')).not.toBeNull();
    expect(parseLocalDay('2026-02-31')).toBeNull();
    expect(parseLocalDay('26-2-3')).toBeNull();
    expect(parseLocalDay('not-a-date')).toBeNull();
  });

  it('adds days across month, year and leap-day boundaries', () => {
    expect(addLocalDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addLocalDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addLocalDays('2026-03-31', 1)).toBe('2026-04-01');
    expect(addLocalDays('2026-01-10', -6)).toBe('2026-01-04');
  });

  it('steps one calendar day at a time across every day of a year (DST-safe)', () => {
    let key = '2026-01-01';
    for (let i = 0; i < 365; i++) key = addLocalDays(key, 1);
    expect(key).toBe('2027-01-01');
  });

  it('counts whole days between keys', () => {
    expect(localDaysBetween('2026-01-01', '2026-01-08')).toBe(7);
    expect(localDaysBetween('2026-01-08', '2026-01-01')).toBe(-7);
    expect(localDaysBetween('2026-03-01', '2026-03-01')).toBe(0);
    expect(localDaysBetween('2025-12-25', '2026-01-05')).toBe(11);
  });

  it('throws on an invalid key', () => {
    expect(() => addLocalDays('bad', 1)).toThrow(RangeError);
  });
});
