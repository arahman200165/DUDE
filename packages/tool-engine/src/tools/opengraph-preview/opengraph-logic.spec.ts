import { DEFAULT_OG_SETTINGS, buildOgTags, hostnameFor } from "./opengraph-logic.js";

describe('buildOgTags', () => {
  it('emits nothing when every field, including type, is empty', () => {
    expect(buildOgTags({ ...DEFAULT_OG_SETTINGS, type: '' })).toBe('');
  });

  it('emits only og:type for the untouched defaults, since type defaults to "website"', () => {
    expect(buildOgTags(DEFAULT_OG_SETTINGS)).toBe('<meta property="og:type" content="website">');
  });

  it('emits og: meta tags for filled-in fields', () => {
    const output = buildOgTags({ ...DEFAULT_OG_SETTINGS, title: 'My Page', description: 'A description.' });
    expect(output).toContain('<meta property="og:title" content="My Page">');
    expect(output).toContain('<meta property="og:description" content="A description.">');
  });

  it('emits twitter: card tags when there is enough content for a card', () => {
    const output = buildOgTags({ ...DEFAULT_OG_SETTINGS, title: 'My Page' });
    expect(output).toContain('<meta name="twitter:card" content="summary_large_image">');
    expect(output).toContain('<meta name="twitter:title" content="My Page">');
  });

  it('escapes a double quote in content', () => {
    const output = buildOgTags({ ...DEFAULT_OG_SETTINGS, title: 'Say "hi"' });
    expect(output).toContain('content="Say &quot;hi&quot;"');
  });
});

describe('hostnameFor', () => {
  it('extracts the bare hostname from a full URL', () => {
    expect(hostnameFor('https://example.com/path/to/page?x=1')).toBe('example.com');
  });

  it('returns the input verbatim when it is not a parseable URL', () => {
    expect(hostnameFor('not a url')).toBe('not a url');
  });

  it('returns an empty string for empty input', () => {
    expect(hostnameFor('')).toBe('');
  });
});
