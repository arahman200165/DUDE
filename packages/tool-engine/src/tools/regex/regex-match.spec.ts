import { findMatches, replaceMatches } from "./regex-match.js";

describe('findMatches', () => {
  it('rejects an empty pattern', () => {
    expect(findMatches('', '', 'text').ok).toBe(false);
  });

  it('reports a syntax error for an invalid pattern', () => {
    const result = findMatches('(unclosed', '', 'text');
    expect(result.ok).toBe(false);
  });

  it('finds all matches of a simple pattern', () => {
    const result = findMatches('cat', '', 'cat sat cat mat');

    expect(result.ok).toBe(true);
    expect(result.ok && result.matches.map((m) => m.index)).toEqual([0, 8]);
  });

  it('is case-insensitive with the i flag', () => {
    const result = findMatches('cat', 'i', 'CAT cat');

    expect(result.ok).toBe(true);
    expect(result.ok && result.matches).toHaveLength(2);
  });

  it('captures numbered groups', () => {
    const result = findMatches('(\\d+)-(\\d+)', '', '10-20');

    expect(result.ok).toBe(true);
    expect(result.ok && result.matches[0].groups).toEqual([
      { index: 1, value: '10' },
      { index: 2, value: '20' },
    ]);
  });

  it('captures named groups', () => {
    const result = findMatches('(?<year>\\d{4})-(?<month>\\d{2})', '', '2024-01');

    expect(result.ok).toBe(true);
    const named = (result.ok ? result.matches[0].groups : []).filter((g) => g.name);
    expect(named).toEqual([
      { index: -1, name: 'year', value: '2024' },
      { index: -1, name: 'month', value: '01' },
    ]);
  });

  it('does not loop forever on a pattern that can match zero-length', () => {
    const result = findMatches('a*', '', 'bbb');
    expect(result.ok).toBe(true);
  });

  it('returns an empty match list when there is no match', () => {
    const result = findMatches('xyz', '', 'abc');
    expect(result).toEqual({ ok: true, matches: [] });
  });

  it('caps zero-length matches at MAX_MATCHES instead of matching every position', () => {
    const result = findMatches('a*', '', 'b'.repeat(20_000));

    expect(result.ok).toBe(true);
    expect(result.ok && result.matches).toHaveLength(10_000);
  });
});

describe('replaceMatches', () => {
  it('rejects an empty pattern', () => {
    expect(replaceMatches('', '', 'text', '')).toEqual({ ok: false, error: 'Enter a regular expression.' });
  });

  it('reports a syntax error for an invalid pattern', () => {
    expect(replaceMatches('(unclosed', '', 'text', '').ok).toBe(false);
  });

  it('replaces only the first match without the g flag', () => {
    expect(replaceMatches('cat', '', 'cat sat cat', 'dog')).toEqual({ ok: true, output: 'dog sat cat' });
  });

  it('replaces all matches with the g flag', () => {
    expect(replaceMatches('cat', 'g', 'cat sat cat', 'dog')).toEqual({ ok: true, output: 'dog sat dog' });
  });

  it('substitutes numbered capture groups with $1 syntax', () => {
    expect(replaceMatches('(\\d+)-(\\d+)', '', '10-20', '$2-$1')).toEqual({ ok: true, output: '20-10' });
  });

  it('substitutes named capture groups with $<name> syntax', () => {
    expect(replaceMatches('(?<year>\\d{4})-(?<month>\\d{2})', '', '2024-01', '$<month>/$<year>')).toEqual({
      ok: true,
      output: '01/2024',
    });
  });
});
