import { generateHeuristicRegex, tokenize } from "./regex-generate.js";

describe('tokenize', () => {
  it('splits a date-like string into digit/literal runs', () => {
    expect(tokenize('2024-01-15')).toEqual([
      { kind: 'digit', text: '2024', literalChar: undefined },
      { kind: 'literal', text: '-', literalChar: '-' },
      { kind: 'digit', text: '01', literalChar: undefined },
      { kind: 'literal', text: '-', literalChar: '-' },
      { kind: 'digit', text: '15', literalChar: undefined },
    ]);
  });

  it('merges consecutive identical literal characters into one run', () => {
    expect(tokenize('a--b')).toEqual([
      { kind: 'lower', text: 'a', literalChar: undefined },
      { kind: 'literal', text: '--', literalChar: '-' },
      { kind: 'lower', text: 'b', literalChar: undefined },
    ]);
  });

  it('does not merge two different literal characters into one run', () => {
    expect(tokenize('a-_b').map((r) => r.text)).toEqual(['a', '-', '_', 'b']);
  });

  it('distinguishes upper and lower case runs', () => {
    expect(tokenize('ABcd').map((r) => r.kind)).toEqual(['upper', 'lower']);
  });
});

describe('generateHeuristicRegex', () => {
  it('generalizes same-shaped date examples into a bounded digit pattern', () => {
    const result = generateHeuristicRegex(['2024-01-15', '2023-12-31']);
    expect(result.ok).toBe(true);
    expect(result.ok && result.generalized).toBe(true);
    expect(result.ok && result.pattern).toBe('^\\d{4}-\\d{2}-\\d{2}$');
  });

  it('the generalized pattern matches every example', () => {
    const result = generateHeuristicRegex(['2024-01-15', '2023-12-31', '1999-06-07']);
    expect(result.ok).toBe(true);
    const pattern = new RegExp(result.ok ? result.pattern : '');
    expect(pattern.test('2024-01-15')).toBe(true);
    expect(pattern.test('1999-06-07')).toBe(true);
  });

  it('generalizes a variable-length run into a {min,max} quantifier', () => {
    const result = generateHeuristicRegex(['ab', 'abc', 'abcd']);
    expect(result.ok).toBe(true);
    expect(result.ok && result.pattern).toBe('^[a-z]{2,4}$');
  });

  it('falls back to a literal alternation when example shapes diverge', () => {
    const result = generateHeuristicRegex(['abc', '123']);
    expect(result.ok).toBe(true);
    expect(result.ok && result.generalized).toBe(false);
    expect(result.ok && result.pattern).toBe('^(?:abc|123)$');
  });

  it('excludes a counter-example the generalized pattern would otherwise match', () => {
    // "12-34" and "56-78" generalize to \d{2}-\d{2}, which would also match "99-99" — a counter-example forces the fallback.
    const result = generateHeuristicRegex(['12-34', '56-78'], ['99-99']);
    expect(result.ok).toBe(true);
    const pattern = new RegExp(result.ok ? result.pattern : '');
    expect(pattern.test('99-99')).toBe(false);
    expect(pattern.test('12-34')).toBe(true);
    expect(pattern.test('56-78')).toBe(true);
  });

  it('escapes regex-special characters in a literal fallback', () => {
    const result = generateHeuristicRegex(['a.b', 'c*d']);
    expect(result.ok).toBe(true);
    expect(result.ok && result.pattern).toBe('^(?:a\\.b|c\\*d)$');
  });

  it('errors when an example is also listed as a counter-example', () => {
    const result = generateHeuristicRegex(['abc'], ['abc']);
    expect(result.ok).toBe(false);
    expect(result.ok || result.error).toContain('abc');
  });

  it('errors on empty input', () => {
    expect(generateHeuristicRegex([]).ok).toBe(false);
    expect(generateHeuristicRegex(['', '  ']).ok).toBe(false);
  });

  it('ignores blank lines among the examples', () => {
    const result = generateHeuristicRegex(['abc', '', '  ', 'def']);
    expect(result.ok).toBe(true);
    expect(result.ok && result.pattern).toBe('^[a-z]{3}$');
  });
});
