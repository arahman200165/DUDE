import { formatCss } from "./css-format-logic.js";

describe('formatCss — pretty mode', () => {
  it('formats a simple rule with 2-space indent and a normalized colon', () => {
    const result = formatCss('.a{color:red;background : blue}', 'pretty');
    expect(result).toEqual({ ok: true, output: '.a {\n  color: red;\n  background: blue;\n}' });
  });

  it('adds a missing trailing semicolon before the closing brace', () => {
    const result = formatCss('.a { color: red }', 'pretty');
    expect(result).toEqual({ ok: true, output: '.a {\n  color: red;\n}' });
  });

  it('splits a comma-separated selector list, one selector per line', () => {
    const result = formatCss('h1, h2 ,h3 { margin: 0; }', 'pretty');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.output).toContain('h1,\nh2,\nh3 {');
  });

  it('does not split a comma nested inside a pseudo-class function', () => {
    const result = formatCss(':not(a, b) { color: red; }', 'pretty');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.output.split('\n')[0]).toBe(':not(a, b) {');
  });

  it('indents nested rules (e.g. @media)', () => {
    const result = formatCss('@media (min-width: 768px) { .a { color: red; } }', 'pretty');
    expect(result).toEqual({
      ok: true,
      output: '@media (min-width: 768px) {\n  .a {\n    color: red;\n  }\n}',
    });
  });

  it('does not mangle a colon inside an unquoted url() in an at-rule prelude', () => {
    const result = formatCss('@import url(http://example.com/a.css);', 'pretty');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.output).toBe('@import url(http://example.com/a.css);');
  });

  it('preserves a comment and does not treat braces inside a string as structural', () => {
    const result = formatCss('.a { content: "{not a block}"; /* note */ }', 'pretty');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.output).toContain('content: "{not a block}";');
    expect(result.output).toContain('/* note */');
  });

  it('does not split a comma inside a quoted attribute value', () => {
    const result = formatCss('[data-x="a,b"] { color: red; }', 'pretty');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.output.split('\n')[0]).toBe('[data-x="a,b"] {');
  });

  it('reports an unmatched closing brace', () => {
    const result = formatCss('.a { color: red; } }', 'pretty');
    expect(result).toEqual({ ok: false, error: 'Unmatched closing brace — more `}` than `{`.' });
  });

  it('reports an unmatched opening brace', () => {
    const result = formatCss('.a { color: red;', 'pretty');
    expect(result.ok).toBe(false);
  });

  it('reports an unterminated string', () => {
    const result = formatCss('.a { content: "unterminated; }', 'pretty');
    expect(result.ok).toBe(false);
  });

  it('rejects empty input', () => {
    expect(formatCss('', 'pretty')).toEqual({ ok: false, error: 'Enter some CSS to format.' });
  });
});

describe('formatCss — minify mode', () => {
  it('strips whitespace and comments', () => {
    const result = formatCss('.a {\n  color: red; /* comment */\n  background: blue;\n}', 'minify');
    expect(result).toEqual({ ok: true, output: '.a{color:red;background:blue}' });
  });

  it('drops the redundant trailing semicolon before a closing brace', () => {
    const result = formatCss('.a { color: red; }', 'minify');
    expect(result).toEqual({ ok: true, output: '.a{color:red}' });
  });

  it('collapses a comma-separated selector list onto one line without inner spaces', () => {
    const result = formatCss('h1, h2, h3 { margin: 0; }', 'minify');
    expect(result).toEqual({ ok: true, output: 'h1,h2,h3{margin:0}' });
  });

  it('preserves a string value verbatim, including any internal punctuation', () => {
    const result = formatCss('.a { content: "a, b: c {d}"; }', 'minify');
    expect(result).toEqual({ ok: true, output: '.a{content:"a, b: c {d}"}' });
  });
});
