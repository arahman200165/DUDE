import { compileQuery, expandReplacement, replaceLines, searchLines } from './text-search';

const lines = ['const foo = 1;', 'foobar(foo);', 'FOO end'];

describe('text search', () => {
  it('finds literal matches per line with columns and context, case-insensitively by default', () => {
    const { matches, total } = searchLines(lines, compileQuery({ pattern: 'foo', regex: false, caseSensitive: false, wholeWord: false }), 1, 100);
    expect(total).toBe(4);
    expect(matches.map((match) => `${match.line}:${match.column}`)).toEqual(['1:6', '2:0', '2:7', '3:0']);
    expect(matches[1]).toMatchObject({ before: ['const foo = 1;'], after: ['FOO end'] });
  });

  it('supports case sensitivity, whole words, regex, and escapes literal metacharacters', () => {
    expect(searchLines(lines, compileQuery({ pattern: 'foo', regex: false, caseSensitive: true, wholeWord: true }), 0, 100).total).toBe(2);
    expect(searchLines(['a.b axb'], compileQuery({ pattern: 'a.b', regex: false, caseSensitive: true, wholeWord: false }), 0, 100).total).toBe(1);
    expect(searchLines(['a.b axb'], compileQuery({ pattern: 'a.b', regex: true, caseSensitive: true, wholeWord: false }), 0, 100).total).toBe(2);
    expect(() => compileQuery({ pattern: '(', regex: true, caseSensitive: true, wholeWord: false })).toThrow(/Invalid pattern/);
    expect(searchLines(['x'], compileQuery({ pattern: '^', regex: true, caseSensitive: true, wholeWord: false }), 0, 10).total).toBe(0);
  });

  it('clips very long lines around the match', () => {
    const long = 'x'.repeat(2000) + 'NEEDLE' + 'y'.repeat(2000);
    const [match] = searchLines([long], compileQuery({ pattern: 'needle', regex: false, caseSensitive: false, wholeWord: false }), 0, 1).matches;
    expect(match.column).toBe(2000);
    expect(match.text.length).toBeLessThan(410);
    expect(match.text.slice(match.textColumn, match.textColumn + 6)).toBe('NEEDLE');
  });
});

describe('replace', () => {
  it('expands $&, numbered and named groups, and $$ like String.replace', () => {
    const match = /(?<key>\w+)=(\d+)/.exec('port=80')!;
    expect(expandReplacement('$2:$<key>:$&:$$:$9', match)).toBe('80:port:port=80:$:$9');
  });

  it('replaces exactly the matches a search reports, honoring per-hunk skips', () => {
    const regex = compileQuery({ pattern: 'foo', regex: false, caseSensitive: true, wholeWord: false });
    const result = replaceLines(lines, regex, 'bar', true, new Set(['2:7']));
    expect(result.lines).toEqual(['const bar = 1;', 'barbar(foo);', 'FOO end']);
    expect(result.replaced).toBe(2);
    expect(result.samples[0]).toEqual({ line: 1, before: 'const foo = 1;', after: 'const bar = 1;' });
    const groups = replaceLines(['v1.2'], compileQuery({ pattern: 'v(\\d+)\\.(\\d+)', regex: true, caseSensitive: true, wholeWord: false }), 'v$2.$1', false);
    expect(groups.lines).toEqual(['v2.1']);
    expect(replaceLines(['a$1'], compileQuery({ pattern: 'a', regex: false, caseSensitive: true, wholeWord: false }), '$1', true).lines).toEqual(['$1$1']);
  });
});
