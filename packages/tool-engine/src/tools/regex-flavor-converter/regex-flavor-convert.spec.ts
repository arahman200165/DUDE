import { convertRegexFlavor } from "./regex-flavor-convert.js";

function output(pattern: string, source: 'js' | 'python' | 'java' | 'dotnet' | 'pcre' | 'go', target: typeof source, flags = ''): string {
  const result = convertRegexFlavor(pattern, flags, source, target);
  if (!result.ok) throw new Error(`expected ok, got error: ${result.error}`);
  return result.output;
}

describe('convertRegexFlavor', () => {
  it('errors on empty input', () => {
    expect(convertRegexFlavor('', '', 'js', 'python')).toEqual({ ok: false, error: 'Enter a regular expression.' });
  });

  it('round-trips a simple pattern unchanged across flavors with no exotic syntax', () => {
    expect(output('foo\\d+bar', 'js', 'go')).toBe('foo\\d+bar');
  });

  it('re-emits a JS named group for Python as (?P<name>...)', () => {
    expect(output('(?<year>\\d{4})', 'js', 'python')).toBe('(?P<year>\\d{4})');
  });

  it('re-emits a JS named backreference for Python as (?P=name)', () => {
    expect(output('(?<x>a)\\k<x>', 'js', 'python')).toBe('(?P<x>a)(?P=x)');
  });

  it('normalizes a Python-sourced named group into JS syntax for a JS target', () => {
    expect(output('(?P<year>\\d{4})', 'python', 'js')).toBe('(?<year>\\d{4})');
  });

  it('normalizes a Python-sourced named backreference for a JS target', () => {
    expect(output('(?P<x>a)(?P=x)', 'python', 'js')).toBe('(?<x>a)\\k<x>');
  });

  it("normalizes .NET's (?'name'...) named group syntax", () => {
    expect(output("(?'year'\\d{4})", 'dotnet', 'js')).toBe('(?<year>\\d{4})');
  });

  it('normalizes Go-sourced (?P<name>...) into JS syntax', () => {
    expect(output('(?P<year>\\d{4})', 'go', 'js')).toBe('(?<year>\\d{4})');
  });

  it('normalizes PCRE possessive quantifiers to their greedy equivalent, with a warning', () => {
    const result = convertRegexFlavor('a++', '', 'pcre', 'js');
    expect(result.ok).toBe(true);
    expect(result.ok && result.output).toBe('a+');
    expect(result.ok && result.warnings.some((w) => w.includes('Possessive quantifiers'))).toBe(true);
  });

  it('normalizes PCRE atomic groups to a plain non-capturing group, with a warning', () => {
    const result = convertRegexFlavor('(?>abc)', '', 'pcre', 'js');
    expect(result.ok).toBe(true);
    expect(result.ok && result.output).toBe('(?:abc)');
    expect(result.ok && result.warnings.some((w) => w.includes('Atomic groups'))).toBe(true);
  });

  it('warns that lookahead will not compile in Go, but still emits the pattern', () => {
    const result = convertRegexFlavor('foo(?=bar)', '', 'js', 'go');
    expect(result.ok).toBe(true);
    expect(result.ok && result.output).toBe('foo(?=bar)');
    expect(result.ok && result.warnings.some((w) => w.includes('does not support lookahead'))).toBe(true);
  });

  it('warns that backreferences will not compile in Go, but still emits the pattern', () => {
    const result = convertRegexFlavor('(a)\\1', '', 'js', 'go');
    expect(result.ok).toBe(true);
    expect(result.ok && result.warnings.some((w) => w.includes('does not support backreferences'))).toBe(true);
  });

  it('warns about unbounded lookbehind for a Java target', () => {
    const result = convertRegexFlavor('(?<=a*)b', '', 'js', 'java');
    expect(result.ok).toBe(true);
    expect(result.ok && result.warnings.some((w) => w.includes('bounded'))).toBe(true);
  });

  it('preserves character classes, quantifiers, and anchors verbatim', () => {
    expect(output('^[a-z0-9]{2,5}$', 'js', 'dotnet')).toBe('^[a-z0-9]{2,5}$');
  });

  it('preserves a non-capturing group and alternation', () => {
    expect(output('(?:cat|dog)', 'js', 'pcre')).toBe('(?:cat|dog)');
  });

  it('preserves a lazy quantifier', () => {
    expect(output('a+?', 'js', 'python')).toBe('a+?');
  });

  it('preserves a numeric backreference identically across flavors', () => {
    expect(output('(a)\\1', 'js', 'python')).toBe('(a)\\1');
  });

  it('errors with a source-flavor-aware message for an unparseable pattern', () => {
    const result = convertRegexFlavor('(unclosed', '', 'python', 'js');
    expect(result.ok).toBe(false);
    expect(result.ok || result.error).toContain('Python re');
  });
});
