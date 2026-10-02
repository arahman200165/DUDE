import { renderMarkdown } from "./markdown-render.js";

describe('renderMarkdown', () => {
  it('renders a heading', () => {
    expect(renderMarkdown('# Hello')).toContain('<h1>Hello</h1>');
  });

  it('renders emphasis and strong text', () => {
    const html = renderMarkdown('**bold** and *italic*');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<em>italic</em>');
  });

  it('renders a fenced code block', () => {
    expect(renderMarkdown('```\nconst x = 1;\n```')).toContain('<pre>');
  });

  it('renders an empty string for empty input', () => {
    expect(renderMarkdown('')).toBe('');
  });

  it('never lets a raw <script> tag through', () => {
    const html = renderMarkdown('<script>alert(1)</script>\n\n# Still renders');
    expect(html.toLowerCase()).not.toContain('<script');
    expect(html).toContain('<h1>Still renders</h1>');
  });

  it('never turns a javascript: URL into a clickable link', () => {
    const html = renderMarkdown('[click me](javascript:alert(1))');
    expect(html.toLowerCase()).not.toMatch(/href=["']javascript:/);
  });

  it('escapes a raw <img onerror=…> tag instead of emitting real HTML', () => {
    const html = renderMarkdown('<img src=x onerror=alert(1)>');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });
});
