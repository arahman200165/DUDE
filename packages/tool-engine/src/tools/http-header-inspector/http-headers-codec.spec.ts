import { buildHeaders, parseHeaders } from "./http-headers-codec.js";

describe('parseHeaders', () => {
  it('parses simple Name: value lines, preserving order', () => {
    expect(parseHeaders('Content-Type: application/json\nAccept: */*')).toEqual([
      { key: 'Content-Type', value: 'application/json' },
      { key: 'Accept', value: '*/*' },
    ]);
  });

  it('preserves duplicate header names', () => {
    expect(parseHeaders('Set-Cookie: a=1\nSet-Cookie: b=2')).toEqual([
      { key: 'Set-Cookie', value: 'a=1' },
      { key: 'Set-Cookie', value: 'b=2' },
    ]);
  });

  it('tolerates extra whitespace around the colon and around values', () => {
    expect(parseHeaders('Content-Type  :   application/json  ')).toEqual([
      { key: 'Content-Type', value: 'application/json' },
    ]);
  });

  it('skips a leading request line', () => {
    expect(parseHeaders('GET /path HTTP/1.1\nHost: example.com')).toEqual([{ key: 'Host', value: 'example.com' }]);
  });

  it('skips a leading status line', () => {
    expect(parseHeaders('HTTP/1.1 200 OK\nContent-Length: 0')).toEqual([{ key: 'Content-Length', value: '0' }]);
  });

  it('stops at the first blank line and ignores anything after it', () => {
    expect(parseHeaders('Content-Type: application/json\n\n{"a":1}')).toEqual([
      { key: 'Content-Type', value: 'application/json' },
    ]);
  });

  it('silently skips unparsable lines without throwing', () => {
    expect(parseHeaders('not a header\nContent-Type: application/json')).toEqual([
      { key: 'Content-Type', value: 'application/json' },
    ]);
  });

  it('returns an empty list for blank input', () => {
    expect(parseHeaders('')).toEqual([]);
    expect(parseHeaders('   \n  ')).toEqual([]);
  });
});

describe('buildHeaders', () => {
  it('round-trips well-formed input', () => {
    const raw = 'Content-Type: application/json\nAccept: */*';
    expect(buildHeaders(parseHeaders(raw))).toBe(raw);
  });

  it('skips pairs with an empty key', () => {
    expect(
      buildHeaders([
        { key: '', value: 'ignored' },
        { key: 'Accept', value: '*/*' },
      ]),
    ).toBe('Accept: */*');
  });

  it('returns an empty string for no pairs', () => {
    expect(buildHeaders([])).toBe('');
  });
});
