import { DEFAULT_META_SETTINGS, buildMetaTags } from "./meta-tag-logic.js";

describe('buildMetaTags', () => {
  it('emits charset and viewport from the defaults', () => {
    const output = buildMetaTags(DEFAULT_META_SETTINGS);
    expect(output).toBe('<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">');
  });

  it('emits a title tag and description meta tag when set', () => {
    const output = buildMetaTags({ ...DEFAULT_META_SETTINGS, title: 'My Page', description: 'A page about things.' });
    expect(output).toContain('<title>My Page</title>');
    expect(output).toContain('<meta name="description" content="A page about things.">');
  });

  it('emits a canonical link tag when set', () => {
    const output = buildMetaTags({ ...DEFAULT_META_SETTINGS, canonical: 'https://example.com/page' });
    expect(output).toContain('<link rel="canonical" href="https://example.com/page">');
  });

  it('omits any field left blank', () => {
    const output = buildMetaTags({ ...DEFAULT_META_SETTINGS, charset: '', viewport: '' });
    expect(output).toBe('');
  });

  it('escapes a double quote in an attribute value', () => {
    const output = buildMetaTags({ ...DEFAULT_META_SETTINGS, charset: '', viewport: '', author: 'Jane "JD" Doe' });
    expect(output).toBe('<meta name="author" content="Jane &quot;JD&quot; Doe">');
  });

  it('escapes < and > in the title text', () => {
    const output = buildMetaTags({ ...DEFAULT_META_SETTINGS, charset: '', viewport: '', title: '<script>' });
    expect(output).toBe('<title>&lt;script&gt;</title>');
  });
});
