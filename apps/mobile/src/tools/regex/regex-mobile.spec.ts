import { describe, expect, it } from 'vitest';
import { decodeFlags, isRiskyPattern, MAX_RENDERED_MATCHES, MAX_TEXT_LENGTH, matchCountLabel, normalizeFlags, runRegex, toggleFlag } from './regex-mobile';

describe('flags', () => {
  it('normalizes to canonical order and drops unknown characters', () => {
    expect(normalizeFlags('yigx')).toBe('giy');
  });
  it('toggles a flag on and off', () => {
    expect(toggleFlag('g', 'i')).toBe('gi');
    expect(toggleFlag('gi', 'g')).toBe('i');
  });
  it('decodes only valid persisted values', () => {
    expect(decodeFlags('gi')).toBe('gi');
    expect(decodeFlags('gx')).toBeNull();
    expect(decodeFlags(3)).toBeNull();
  });
});

describe('isRiskyPattern', () => {
  it('flags nested unbounded quantifiers', () => {
    expect(isRiskyPattern('(a+)+$')).toBe(true);
    expect(isRiskyPattern('(\\w+\\s?)*')).toBe(true);
    expect(isRiskyPattern('(x{2,})+')).toBe(true);
  });
  it('accepts ordinary patterns', () => {
    expect(isRiskyPattern('([0-9]+)-([0-9]+)')).toBe(false);
    expect(isRiskyPattern('(?<year>\\d{4})-(?<month>\\d{2})')).toBe(false);
    expect(isRiskyPattern('a+b*')).toBe(false);
  });
});

describe('runRegex', () => {
  it('is idle without a pattern', () => {
    expect(runRegex({ kind: 'match', pattern: '', flags: 'g', text: 'x' })).toEqual({ status: 'idle' });
  });
  it('matches (vector from regex-match.spec.ts: cat in "cat sat cat mat" at 0 and 8)', () => {
    const outcome = runRegex({ kind: 'match', pattern: 'cat', flags: 'g', text: 'cat sat cat mat' });
    expect(outcome.status === 'matches' && outcome.matches.map(match => match.index)).toEqual([0, 8]);
  });
  it('replaces (vector from regex-match.spec.ts: all cat -> dog)', () => {
    expect(runRegex({ kind: 'replace', pattern: 'cat', flags: 'g', text: 'cat sat cat', replacement: 'dog' })).toEqual({ status: 'replaced', output: 'dog sat dog' });
  });
  it('reports an invalid pattern', () => {
    expect(runRegex({ kind: 'match', pattern: '(unclosed', flags: 'g', text: 'abc' }).status).toBe('error');
  });
  it('rejects text above the cap', () => {
    expect(runRegex({ kind: 'match', pattern: 'a', flags: 'g', text: 'a'.repeat(MAX_TEXT_LENGTH + 1) }).status).toBe('error');
  });
  it('guards a risky pattern on long text unless allowed', () => {
    const request = { kind: 'match', pattern: '(a+)+$', flags: 'g', text: `${'a'.repeat(30)}!` } as const;
    expect(runRegex(request).status).toBe('guarded');
    expect(runRegex({ ...request, text: 'aaa!' }).status).toBe('matches');
  });
  it('caps rendered matches but reports the full total', () => {
    const outcome = runRegex({ kind: 'match', pattern: 'a', flags: 'g', text: 'a'.repeat(MAX_RENDERED_MATCHES + 50) });
    expect(outcome.status === 'matches' && [outcome.total, outcome.matches.length, outcome.truncated]).toEqual([MAX_RENDERED_MATCHES + 50, MAX_RENDERED_MATCHES, true]);
  });
  it('labels counts', () => {
    expect(matchCountLabel(1)).toBe('1 match');
    expect(matchCountLabel(2)).toBe('2 matches');
  });
});
