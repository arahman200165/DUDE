import { sanitizeEditorHtml } from "./rich-text-export.js";

describe('sanitizeEditorHtml', () => {
  it('passes through plain formatted HTML unchanged in substance', () => {
    const html = '<p><strong>bold</strong> and <em>italic</em></p>';
    expect(sanitizeEditorHtml(html)).toBe(html);
  });

  it('strips script tags', () => {
    const result = sanitizeEditorHtml('<p>hello</p><script>alert(1)</script>');
    expect(result).not.toContain('<script');
    expect(result).toContain('hello');
  });

  it('strips inline event-handler attributes', () => {
    const result = sanitizeEditorHtml('<img src="x.png" onerror="alert(1)">');
    expect(result).not.toContain('onerror');
  });

  it('strips javascript: URIs from links', () => {
    const result = sanitizeEditorHtml('<a href="javascript:alert(1)">click</a>');
    expect(result).not.toContain('javascript:');
  });
});
