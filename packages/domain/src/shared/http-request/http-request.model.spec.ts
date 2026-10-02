import { EMPTY_REQUEST, buildFullUrl, splitUrl } from "./http-request.model.js";

describe('splitUrl', () => {
  it('splits a URL with a query string into base and params', () => {
    expect(splitUrl('https://api.example.com/users?active=true&sort=name')).toEqual({
      base: 'https://api.example.com/users',
      queryParams: [
        { key: 'active', value: 'true' },
        { key: 'sort', value: 'name' },
      ],
    });
  });

  it('returns the whole URL as base with no params when there is no query string', () => {
    expect(splitUrl('https://api.example.com/users')).toEqual({
      base: 'https://api.example.com/users',
      queryParams: [],
    });
  });

  it('preserves duplicate query keys', () => {
    expect(splitUrl('https://example.com?a=1&a=2')).toEqual({
      base: 'https://example.com',
      queryParams: [
        { key: 'a', value: '1' },
        { key: 'a', value: '2' },
      ],
    });
  });
});

describe('buildFullUrl', () => {
  it('returns the base URL unchanged when there are no query params', () => {
    expect(buildFullUrl({ ...EMPTY_REQUEST, url: 'https://example.com' })).toBe('https://example.com');
  });

  it('appends query params to the base URL', () => {
    expect(
      buildFullUrl({
        ...EMPTY_REQUEST,
        url: 'https://example.com',
        queryParams: [{ key: 'a', value: '1' }],
      }),
    ).toBe('https://example.com?a=1');
  });

  it('round-trips through splitUrl for a URL with duplicate query keys', () => {
    const url = 'https://example.com/path?a=1&a=2&b=x';
    const split = splitUrl(url);
    expect(buildFullUrl({ ...EMPTY_REQUEST, url: split.base, queryParams: split.queryParams })).toBe(url);
  });
});
