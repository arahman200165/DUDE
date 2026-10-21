import { describe, expect, it } from 'vitest';
import { claimRows, expiryPill, formatInstant, relativeTime } from './jwt-mobile';

const now = new Date('2026-01-01T00:00:00Z');

describe('relativeTime', () => {
  it('uses the largest whole unit in both directions', () => {
    expect(relativeTime(new Date('2025-12-29T00:00:00Z'), now)).toBe('3 days ago');
    expect(relativeTime(new Date('2026-01-01T02:00:00Z'), now)).toBe('in 2 hours');
    expect(relativeTime(new Date('2024-01-01T00:00:00Z'), now)).toBe('2 years ago');
    expect(relativeTime(new Date('2025-12-31T23:59:00Z'), now)).toBe('1 minute ago');
    expect(relativeTime(now, now)).toBe('now');
  });
});

describe('expiryPill', () => {
  it('spells the state out in text', () => {
    expect(expiryPill({ kind: 'no-claim' }, now)).toEqual({ label: 'No exp claim', tone: 'info' });
    expect(expiryPill({ kind: 'expired', expiresAt: new Date('2025-12-31T00:00:00Z') }, now)).toEqual({ label: 'Expired 1 day ago', tone: 'error' });
    expect(expiryPill({ kind: 'valid', expiresAt: new Date('2026-01-03T00:00:00Z') }, now)).toEqual({ label: 'Valid, expires in 2 days', tone: 'success' });
  });
  it('reports an out-of-range exp instead of throwing', () => {
    expect(expiryPill({ kind: 'valid', expiresAt: new Date(1e20) }, now).tone).toBe('warning');
    expect(formatInstant(new Date(1e20), 1e17)).toBe('100000000000000000');
  });
});

describe('claimRows', () => {
  it('lists header facts, standard claims, human times and custom claims', () => {
    const rows = claimRows({ alg: 'HS256', typ: 'JWT' }, { sub: '1234567890', name: 'John Doe', iat: 1516239022, admin: true });
    expect(rows.map(row => [row.key, row.value])).toEqual([
      ['alg', 'HS256'], ['typ', 'JWT'], ['sub', '1234567890'], ['iat', '2018-01-18T01:30:22.000Z'], ['claim-name', 'John Doe'], ['claim-admin', 'true'],
    ]);
  });
  it('keeps a non-numeric temporal claim as raw text and tolerates a non-object payload', () => {
    expect(claimRows({}, { exp: 'soon' })).toEqual([{ key: 'exp', label: 'exp', value: 'soon' }]);
    expect(claimRows({ alg: 'none' }, 'text')).toEqual([{ key: 'alg', label: 'Algorithm (alg)', value: 'none' }]);
  });
});
