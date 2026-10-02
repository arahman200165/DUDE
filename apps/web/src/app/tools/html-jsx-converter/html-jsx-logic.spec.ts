import { htmlToJsx, jsxToHtml } from './html-jsx-logic';

describe('htmlToJsx', () => {
  it('renames class to className', () => {
    const result = htmlToJsx('<div class="card">x</div>');
    expect(result).toEqual({ ok: true, output: '<div className="card">x</div>' });
  });

  it('renames for to htmlFor', () => {
    const result = htmlToJsx('<label for="name">Name</label>');
    expect(result).toEqual({ ok: true, output: '<label htmlFor="name">Name</label>' });
  });

  it('converts kebab-case DOM attributes to camelCase, but leaves data-*/aria-* alone', () => {
    const result = htmlToJsx('<div tabindex="0" data-test-id="x" aria-hidden="true"></div>');
    expect(result).toEqual({ ok: true, output: '<div tabIndex="0" data-test-id="x" aria-hidden="true"></div>' });
  });

  it('converts a style attribute string into a JSX style object', () => {
    const result = htmlToJsx('<div style="color: red; font-size: 14px;"></div>');
    expect(result).toEqual({ ok: true, output: "<div style={{ color: 'red', fontSize: '14px' }}></div>" });
  });

  it('self-closes void elements', () => {
    const result = htmlToJsx('<img src="a.png">');
    expect(result).toEqual({ ok: true, output: '<img src="a.png" />' });
  });

  it('converts an HTML comment to a JSX comment expression', () => {
    const result = htmlToJsx('<div><!-- note --></div>');
    expect(result).toEqual({ ok: true, output: '<div>\n  {/* note */}\n</div>' });
  });

  it('escapes a literal curly brace in text content', () => {
    const result = htmlToJsx('<p>a {b} c</p>');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.output).toContain("{'{'}");
    expect(result.output).toContain("{'}'}");
  });

  it('rejects empty input', () => {
    expect(htmlToJsx('')).toEqual({ ok: false, error: 'Enter some HTML to convert.' });
  });
});

describe('jsxToHtml', () => {
  it('reverses className back to class', () => {
    const result = jsxToHtml('<div className="card">x</div>');
    expect(result).toEqual({ ok: true, output: '<div class="card">x</div>' });
  });

  it('reverses htmlFor back to for', () => {
    const result = jsxToHtml('<label htmlFor="name">Name</label>');
    expect(result).toEqual({ ok: true, output: '<label for="name">Name</label>' });
  });

  it('reverses a JSX style object back into a style attribute string', () => {
    const result = jsxToHtml("<div style={{ color: 'red', fontSize: '14px' }}></div>");
    expect(result).toEqual({ ok: true, output: '<div style="color: red; font-size: 14px"></div>' });
  });

  it('converts a self-closing void element back to unclosed HTML form', () => {
    const result = jsxToHtml('<img src="a.png" />');
    expect(result).toEqual({ ok: true, output: '<img src="a.png">' });
  });

  it('converts a JSX comment expression back to an HTML comment', () => {
    const result = jsxToHtml('<div>{/* note */}</div>');
    expect(result).toEqual({ ok: true, output: '<div><!-- note --></div>' });
  });

  it('rejects empty input', () => {
    expect(jsxToHtml('')).toEqual({ ok: false, error: 'Enter some JSX to convert.' });
  });
});

describe('round trip', () => {
  it('htmlToJsx then jsxToHtml recovers the same attributes and tags', () => {
    const original = '<div class="card" tabindex="0"><label for="x">Hi</label></div>';
    const jsx = htmlToJsx(original);
    expect(jsx.ok).toBe(true);
    if (!jsx.ok) return;
    const html = jsxToHtml(jsx.output);
    expect(html.ok).toBe(true);
    if (!html.ok) return;
    expect(html.output).toContain('class="card"');
    expect(html.output).toContain('tabindex="0"');
    expect(html.output).toContain('for="x"');
    expect(html.output).toContain('<div');
    expect(html.output).toContain('<label');
  });
});
