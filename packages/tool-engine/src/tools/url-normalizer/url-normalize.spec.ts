import { compareUrls, normalizeUrl, resolveUrl } from "./url-normalize.js";

describe('normalizeUrl', () => {
  it('lowercases scheme and host, and removes the default port', () => {
    const result = normalizeUrl('HTTP://Example.COM:80/a');
    expect(result.ok).toBe(true);
    expect(result.ok && result.normalized).toBe('http://example.com/a');
  });

  it('decodes percent-encoded unreserved characters back to literal form', () => {
    const result = normalizeUrl('https://example.com/%7Euser/%41%2d%5f%7e');
    expect(result.ok).toBe(true);
    expect(result.ok && result.normalized).toBe('https://example.com/~user/A-_~');
  });

  it('uppercases the hex digits of percent-encoded reserved bytes', () => {
    const result = normalizeUrl('https://example.com/a%2fb');
    expect(result.ok).toBe(true);
    expect(result.ok && result.normalized).toBe('https://example.com/a%2Fb');
  });

  it('removes dot-segments from the path', () => {
    const result = normalizeUrl('https://example.com/a/b/../../c');
    expect(result.ok).toBe(true);
    expect(result.ok && result.normalized).toBe('https://example.com/c');
  });

  it('leaves an already-normalized URL unchanged (changed: false)', () => {
    const result = normalizeUrl('https://example.com/a?x=1');
    expect(result.ok).toBe(true);
    expect(result.ok && result.changed).toBe(false);
  });

  it('sorts query parameters when requested', () => {
    const result = normalizeUrl('https://example.com/?b=2&a=1', {
      sortQueryParams: true,
      stripTrailingSlash: false,
      stripFragment: false,
    });
    expect(result.ok).toBe(true);
    expect(result.ok && result.normalized).toBe('https://example.com/?a=1&b=2');
  });

  it('strips a trailing slash when requested, but not for a bare root path', () => {
    const opts = { sortQueryParams: false, stripTrailingSlash: true, stripFragment: false };
    expect(normalizeUrl('https://example.com/a/', opts)).toEqual({
      ok: true,
      normalized: 'https://example.com/a',
      changed: true,
    });
    expect(normalizeUrl('https://example.com/', opts)).toEqual({
      ok: true,
      normalized: 'https://example.com/',
      changed: false,
    });
  });

  it('strips the fragment when requested', () => {
    const result = normalizeUrl('https://example.com/a#top', {
      sortQueryParams: false,
      stripTrailingSlash: false,
      stripFragment: true,
    });
    expect(result.ok).toBe(true);
    expect(result.ok && result.normalized).toBe('https://example.com/a');
  });

  it('errors on empty or relative input', () => {
    expect(normalizeUrl('').ok).toBe(false);
    expect(normalizeUrl('/just/a/path').ok).toBe(false);
  });
});

describe('resolveUrl', () => {
  it('resolves a relative path against a base URL', () => {
    expect(resolveUrl('https://example.com/a/b/', '../c')).toEqual({
      ok: true,
      resolved: 'https://example.com/a/c',
    });
  });

  it('resolves a protocol-relative reference', () => {
    expect(resolveUrl('https://example.com/a', '//other.com/x')).toEqual({
      ok: true,
      resolved: 'https://other.com/x',
    });
  });

  it('an absolute relative reference overrides the base entirely', () => {
    expect(resolveUrl('https://example.com/a', 'https://other.com/x')).toEqual({
      ok: true,
      resolved: 'https://other.com/x',
    });
  });

  it('errors when the base is missing or not absolute', () => {
    expect(resolveUrl('', '/x').ok).toBe(false);
    expect(resolveUrl('/not/absolute', '/x').ok).toBe(false);
  });
});

describe('compareUrls', () => {
  it('treats superficially different but equivalent URLs as equal', () => {
    const result = compareUrls('HTTP://Example.com:80/a/../b', 'http://example.com/b');
    expect(result.ok).toBe(true);
    expect(result.ok && result.equivalent).toBe(true);
  });

  it('reports genuinely different URLs as not equivalent, with a per-component diff', () => {
    const result = compareUrls('https://example.com/a?x=1', 'https://example.com/a?x=2');
    expect(result.ok).toBe(true);
    expect(result.ok && result.equivalent).toBe(false);
    expect(result.ok && result.diffs.find((d) => d.component === 'query')).toEqual({
      component: 'query',
      a: '?x=1',
      b: '?x=2',
      equal: false,
    });
    expect(result.ok && result.diffs.find((d) => d.component === 'path')?.equal).toBe(true);
  });

  it('propagates a normalization error from either side', () => {
    expect(compareUrls('not a url', 'https://example.com')).toEqual({
      ok: false,
      error: 'First URL: Not a valid absolute URL.',
    });
    expect(compareUrls('https://example.com', 'not a url')).toEqual({
      ok: false,
      error: 'Second URL: Not a valid absolute URL.',
    });
  });
});
