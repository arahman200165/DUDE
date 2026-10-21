import { describe, expect, it } from 'vitest';
import { compareRows, coverageView, rangeRows, sortView } from './semver-comparator-mobile';

const find = (outcome: ReturnType<typeof compareRows>, key: string) => outcome.ok ? outcome.rows.find(row => row.key === key)?.value : undefined;

describe('compareRows', () => {
  it('reports a patch difference (semver-compare.spec.ts: 1.2.3 vs 1.2.4)', () => {
    const outcome = compareRows('1.2.3', '1.2.4');
    expect([find(outcome, 'result'), find(outcome, 'diff')]).toEqual(['Version A < Version B', 'patch']);
  });
  it('reports equal versions and the other direction', () => {
    const equal = compareRows('1.2.3', '1.2.3');
    expect([find(equal, 'result'), find(equal, 'diff')]).toEqual(['Version A equals Version B', 'none (identical)']);
    expect(find(compareRows('2.0.0', '1.9.9'), 'result')).toBe('Version A > Version B');
  });
  it('shows prerelease and build parts (semver-compare.spec.ts: 1.0.0-alpha.1+build5)', () => {
    const outcome = compareRows('1.0.0-alpha.1+build5', '1.0.0');
    expect([find(outcome, 'a-prerelease'), find(outcome, 'a-build'), find(outcome, 'b-prerelease')]).toEqual(['alpha.1', 'build5', '(none)']);
  });
  it('rejects an invalid version', () => {
    expect(compareRows('not-a-version', '1.0.0').ok).toBe(false);
  });
});

describe('sortView', () => {
  it('sorts and separates invalid lines (semver-compare.spec.ts)', () => {
    expect(sortView('2.0.0\n1.0.0\nnope\n1.5.0\n', 'asc')).toEqual({ sorted: '1.0.0\n1.5.0\n2.0.0', invalid: ['nope'] });
    expect(sortView('1.0.0\n2.0.0\n1.5.0', 'desc').sorted).toBe('2.0.0\n1.5.0\n1.0.0');
  });
});

describe('rangeRows', () => {
  it('checks satisfaction (semver-compare.spec.ts: 1.2.5 satisfies ^1.2.0, 2.0.0 does not)', () => {
    expect(find(rangeRows('1.2.5', '^1.2.0'), 'result')).toBe('satisfies');
    expect(find(rangeRows('1.2.5', '^1.2.0'), 'normalized')).toBe('>=1.2.0 <2.0.0-0');
    expect(find(rangeRows('2.0.0', '^1.2.0'), 'result')).toBe('does not satisfy');
  });
  it('rejects an invalid range', () => {
    expect(rangeRows('1.0.0', 'not-a-range').ok).toBe(false);
  });
});

describe('coverageView', () => {
  it('lists the probe versions a caret range covers (semver-compare.spec.ts: ^1.2.0)', () => {
    const [entry] = coverageView('^1.2.0');
    expect(entry).toMatchObject({ ok: true, matched: '1.2.0, 1.5.0, 1.9.0' });
  });
  it('skips blank lines and reports an invalid range', () => {
    const entries = coverageView('^1.0.0\n\nnot-a-range');
    expect(entries.map(entry => entry.ok)).toEqual([true, false]);
  });
});
