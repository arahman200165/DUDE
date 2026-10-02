import { buildQueryString, parseQueryString } from "./query-string-codec.js";

describe('parseQueryString', () => {
  it('parses a plain query string', () => {
    expect(parseQueryString('a=1&b=2')).toEqual([
      { key: 'a', value: '1' },
      { key: 'b', value: '2' },
    ]);
  });

  it('handles a leading question mark', () => {
    expect(parseQueryString('?a=1&b=2')).toEqual([
      { key: 'a', value: '1' },
      { key: 'b', value: '2' },
    ]);
  });

  it('extracts the query part from a full URL', () => {
    expect(parseQueryString('https://example.com/path?a=1&b=2#hash')).toEqual([
      { key: 'a', value: '1' },
      { key: 'b', value: '2#hash' },
    ]);
  });

  it('preserves duplicate keys in order', () => {
    expect(parseQueryString('a=1&a=2&a=3')).toEqual([
      { key: 'a', value: '1' },
      { key: 'a', value: '2' },
      { key: 'a', value: '3' },
    ]);
  });

  it('decodes percent-encoded values', () => {
    expect(parseQueryString('q=hello%20world')).toEqual([{ key: 'q', value: 'hello world' }]);
  });

  it('handles keys with no value', () => {
    expect(parseQueryString('flag&other=1')).toEqual([
      { key: 'flag', value: '' },
      { key: 'other', value: '1' },
    ]);
  });

  it('returns an empty list for blank input', () => {
    expect(parseQueryString('')).toEqual([]);
    expect(parseQueryString('   ')).toEqual([]);
  });
});

describe('buildQueryString', () => {
  it('builds a query string from pairs', () => {
    expect(
      buildQueryString([
        { key: 'a', value: '1' },
        { key: 'b', value: '2' },
      ]),
    ).toBe('a=1&b=2');
  });

  it('percent-encodes values needing escaping', () => {
    expect(buildQueryString([{ key: 'q', value: 'hello world&more' }])).toBe('q=hello+world%26more');
  });

  it('preserves duplicate keys', () => {
    expect(
      buildQueryString([
        { key: 'a', value: '1' },
        { key: 'a', value: '2' },
      ]),
    ).toBe('a=1&a=2');
  });

  it('skips pairs with an empty key', () => {
    expect(
      buildQueryString([
        { key: '', value: 'ignored' },
        { key: 'a', value: '1' },
      ]),
    ).toBe('a=1');
  });

  it('returns an empty string for no pairs', () => {
    expect(buildQueryString([])).toBe('');
  });
});
