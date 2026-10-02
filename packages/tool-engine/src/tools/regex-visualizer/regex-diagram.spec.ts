import { buildRegexDiagram } from "./regex-diagram.js";

function svgText(pattern: string, flags = ''): string {
  const result = buildRegexDiagram(pattern, flags);
  if (!result.ok) throw new Error(`expected ok, got error: ${result.error}`);
  return result.diagram.toString();
}

describe('buildRegexDiagram', () => {
  it('errors on empty input', () => {
    expect(buildRegexDiagram('', '')).toEqual({ ok: false, error: 'Enter a regular expression.' });
  });

  it('errors on an unparseable pattern', () => {
    const result = buildRegexDiagram('(unclosed', '');
    expect(result.ok).toBe(false);
  });

  it('coalesces a literal run into one box', () => {
    expect(svgText('hello')).toContain('hello');
  });

  it('renders a character class in bracket notation (brackets are HTML-entity-escaped by the library)', () => {
    expect(svgText('[a-z0-9]')).toContain('&#91;a-z0-9&#93;');
  });

  it('renders a negated character class', () => {
    expect(svgText('[^abc]')).toContain('&#91;^abc&#93;');
  });

  it('renders alternation branches', () => {
    const text = svgText('cat|dog|bird');
    expect(text).toContain('cat');
    expect(text).toContain('dog');
    expect(text).toContain('bird');
  });

  it('labels a named capturing group (quotes are not in the library\'s escape set, so they stay raw)', () => {
    expect(svgText('(?<year>\\d{4})')).toContain('group "year"');
  });

  it('labels a numbered capturing group', () => {
    expect(svgText('(abc)')).toContain('group #1');
  });

  it('does not label a non-capturing group', () => {
    expect(svgText('(?:abc)')).not.toContain('group');
  });

  it('annotates a range quantifier since the library has no dedicated primitive for it', () => {
    expect(svgText('a{2,5}')).toContain('2-5');
  });

  it('annotates an exact-count quantifier', () => {
    expect(svgText('a{3}')).toContain('×3');
  });

  it('labels lookahead and lookbehind with direction and polarity', () => {
    expect(svgText('a(?=b)')).toContain('followed by');
    expect(svgText('a(?!b)')).toContain('not followed by');
    expect(svgText('(?<=a)b')).toContain('preceded by');
  });

  it('labels a backreference (the "<" in \\k<x> is HTML-entity-escaped)', () => {
    expect(svgText('(a)\\1')).toContain('\\1');
    expect(svgText('(?<x>a)\\k<x>')).toContain('\\k&#60;x>');
  });

  it('HTML-escapes literal special characters (XSS-safety check)', () => {
    const text = svgText('<script>&');
    expect(text).not.toContain('<script>');
    expect(text).toContain('&#60;');
    expect(text).toContain('&#38;');
  });
});
