import { buildUrl, parseUrl } from "./url-parts.js";

describe('parseUrl', () => {
  it('decomposes a full URL into its parts', () => {
    const result = parseUrl('https://user:pass@example.com:8443/a/b?x=1&y=2#section');
    expect(result.ok).toBe(true);
    expect(result.ok && result.parts).toEqual({
      protocol: 'https',
      username: 'user',
      password: 'pass',
      hostname: 'example.com',
      port: '8443',
      pathname: '/a/b',
      queryParams: [
        { key: 'x', value: '1' },
        { key: 'y', value: '2' },
      ],
      hash: 'section',
      origin: 'https://example.com:8443',
    });
  });

  it('defaults empty pieces sensibly for a bare URL', () => {
    const result = parseUrl('https://example.com');
    expect(result.ok).toBe(true);
    expect(result.ok && result.parts.pathname).toBe('/');
    expect(result.ok && result.parts.port).toBe('');
    expect(result.ok && result.parts.queryParams).toEqual([]);
    expect(result.ok && result.parts.hash).toBe('');
  });

  it('reports an error for a relative or malformed URL', () => {
    expect(parseUrl('/just/a/path').ok).toBe(false);
    expect(parseUrl('not a url').ok).toBe(false);
  });

  it('reports an error for empty input', () => {
    expect(parseUrl('').ok).toBe(false);
  });
});

describe('buildUrl', () => {
  const baseParts = {
    protocol: 'https',
    username: '',
    password: '',
    hostname: 'example.com',
    port: '',
    pathname: '/',
    queryParams: [],
    hash: '',
    origin: '',
  };

  it('rebuilds a URL from parts, round-tripping through parseUrl', () => {
    const built = buildUrl({ ...baseParts, pathname: '/a/b', queryParams: [{ key: 'x', value: '1' }], hash: 'top' });
    expect(built.ok).toBe(true);
    expect(built.ok && built.url).toBe('https://example.com/a/b?x=1#top');

    const reparsed = built.ok && parseUrl(built.url);
    expect(reparsed && reparsed.ok && reparsed.parts.pathname).toBe('/a/b');
  });

  it('includes credentials and a non-default port', () => {
    const built = buildUrl({ ...baseParts, username: 'user', password: 'pass', port: '8443' });
    expect(built.ok).toBe(true);
    expect(built.ok && built.url).toBe('https://user:pass@example.com:8443/');
  });

  it('errors when the scheme is missing', () => {
    expect(buildUrl({ ...baseParts, protocol: '' }).ok).toBe(false);
  });

  it('errors when the host is missing', () => {
    expect(buildUrl({ ...baseParts, hostname: '' }).ok).toBe(false);
  });

  it('drops query params with an empty key', () => {
    const built = buildUrl({ ...baseParts, queryParams: [{ key: '', value: 'ignored' }, { key: 'x', value: '1' }] });
    expect(built.ok && built.url).toBe('https://example.com/?x=1');
  });
});
