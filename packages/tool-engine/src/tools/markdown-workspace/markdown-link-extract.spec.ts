import { extractMarkdownLinks, isCheckableUrl } from "./markdown-link-extract.js";

describe('extractMarkdownLinks', () => {
  it('extracts an inline link with its line number', () => {
    const links = extractMarkdownLinks('See [the docs](https://example.com/docs) for more.');
    expect(links).toEqual([{ line: 1, text: 'the docs', url: 'https://example.com/docs' }]);
  });

  it('resolves a reference-style link against its definition', () => {
    const links = extractMarkdownLinks('See [docs][ref] for more.\n\n[ref]: https://example.com');
    expect(links).toEqual([{ line: 1, text: 'docs', url: 'https://example.com' }]);
  });

  it('resolves the shorthand [text][] form using the text as the reference', () => {
    const links = extractMarkdownLinks('See [docs][] for more.\n\n[docs]: https://example.com');
    expect(links).toEqual([{ line: 1, text: 'docs', url: 'https://example.com' }]);
  });

  it('skips a reference link with no matching definition', () => {
    const links = extractMarkdownLinks('See [docs][missing] for more.');
    expect(links).toHaveLength(0);
  });

  it('extracts a bare autolink', () => {
    const links = extractMarkdownLinks('Visit <https://example.com> directly.');
    expect(links).toEqual([{ line: 1, text: 'https://example.com', url: 'https://example.com' }]);
  });

  it('extracts multiple links across multiple lines with correct line numbers', () => {
    const links = extractMarkdownLinks('[a](https://a.com)\n\n[b](https://b.com)');
    expect(links.map((l) => l.line)).toEqual([1, 3]);
  });

  it('extracts a relative/local link (non-http) too, for display, even though it will not be network-checked', () => {
    const links = extractMarkdownLinks('[home](#top)');
    expect(links).toEqual([{ line: 1, text: 'home', url: '#top' }]);
  });
});

describe('isCheckableUrl', () => {
  it('accepts http and https URLs', () => {
    expect(isCheckableUrl('https://example.com')).toBe(true);
    expect(isCheckableUrl('http://example.com')).toBe(true);
  });

  it('rejects relative/anchor/mailto links', () => {
    expect(isCheckableUrl('#top')).toBe(false);
    expect(isCheckableUrl('/relative/path')).toBe(false);
    expect(isCheckableUrl('mailto:a@example.com')).toBe(false);
  });
});
