import { formatHtml } from './html-format-logic';

describe('formatHtml — pretty mode', () => {
  it('indents nested elements by 2 spaces per level', () => {
    const result = formatHtml('<div><p>Hello</p></div>', 'pretty');
    expect(result).toEqual({ ok: true, output: '<div>\n  <p>Hello</p>\n</div>' });
  });

  it('keeps a single text child inline rather than on its own line', () => {
    const result = formatHtml('<h1>Title</h1>', 'pretty');
    expect(result).toEqual({ ok: true, output: '<h1>Title</h1>' });
  });

  it('drops insignificant whitespace-only text between tags', () => {
    const result = formatHtml('<ul>\n  <li>a</li>\n  <li>b</li>\n</ul>', 'pretty');
    expect(result).toEqual({ ok: true, output: '<ul>\n  <li>a</li>\n  <li>b</li>\n</ul>' });
  });

  it('renders a void element without a closing tag', () => {
    const result = formatHtml('<img src="a.png">', 'pretty');
    expect(result).toEqual({ ok: true, output: '<img src="a.png">' });
  });

  it('serializes attributes with double quotes, escaping an internal double quote', () => {
    const result = formatHtml('<div data-x=\'a"b\'></div>', 'pretty');
    expect(result).toEqual({ ok: true, output: '<div data-x="a&quot;b"></div>' });
  });

  it('preserves whitespace verbatim inside <pre>', () => {
    const result = formatHtml('<pre>  line one\n  line two</pre>', 'pretty');
    expect(result).toEqual({ ok: true, output: '<pre>  line one\n  line two</pre>' });
  });

  it('leaves <script> content unescaped and unformatted', () => {
    const result = formatHtml('<script>if (a < b) { x(); }</script>', 'pretty');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.output).toContain('if (a < b) { x(); }');
  });

  it('escapes < and > in ordinary text content', () => {
    const result = formatHtml('<p>1 &lt; 2</p>', 'pretty');
    expect(result).toEqual({ ok: true, output: '<p>1 &lt; 2</p>' });
  });

  it('rejects empty input', () => {
    expect(formatHtml('', 'pretty')).toEqual({ ok: false, error: 'Enter some HTML to format.' });
  });
});

describe('formatHtml — minify mode', () => {
  it('strips whitespace between tags entirely', () => {
    const result = formatHtml('<div>\n  <p>Hello</p>\n</div>', 'minify');
    expect(result).toEqual({ ok: true, output: '<div><p>Hello</p></div>' });
  });

  it('collapses internal whitespace runs in text to a single space', () => {
    const result = formatHtml('<p>a    b\n  c</p>', 'minify');
    expect(result).toEqual({ ok: true, output: '<p>a b c</p>' });
  });

  it('drops comments', () => {
    const result = formatHtml('<div><!-- note --><p>x</p></div>', 'minify');
    expect(result).toEqual({ ok: true, output: '<div><p>x</p></div>' });
  });
});
