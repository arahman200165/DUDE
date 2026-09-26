import { buildCookieHeader, parseCookieHeader } from './cookie-header';

describe('parseCookieHeader', () => {
  it('matches RFC 6265 Section 3.1 multi-cookie request example', () => {
    const parsed = parseCookieHeader('SID=31d4d96e407aad42; lang=en-US');
    expect(parsed).toEqual([{ key: 'SID', value: '31d4d96e407aad42' }, { key: 'lang', value: 'en-US' }]);
    expect(buildCookieHeader(parsed)).toBe('SID=31d4d96e407aad42; lang=en-US');
  });

  it('splits a Cookie header into name/value pairs', () => {
    expect(parseCookieHeader('session=abc123; theme=dark')).toEqual([
      { key: 'session', value: 'abc123' },
      { key: 'theme', value: 'dark' },
    ]);
  });

  it('ignores extra whitespace and empty segments', () => {
    expect(parseCookieHeader('  a=1 ;; b=2  ')).toEqual([
      { key: 'a', value: '1' },
      { key: 'b', value: '2' },
    ]);
  });

  it('treats a valueless cookie as an empty value', () => {
    expect(parseCookieHeader('flag')).toEqual([{ key: 'flag', value: '' }]);
  });

  it('returns an empty array for empty input', () => {
    expect(parseCookieHeader('')).toEqual([]);
  });
});

describe('buildCookieHeader', () => {
  it('joins pairs into a semicolon-separated Cookie header', () => {
    expect(
      buildCookieHeader([
        { key: 'session', value: 'abc123' },
        { key: 'theme', value: 'dark' },
      ]),
    ).toBe('session=abc123; theme=dark');
  });

  it('drops pairs with an empty key', () => {
    expect(
      buildCookieHeader([
        { key: '', value: 'ignored' },
        { key: 'a', value: '1' },
      ]),
    ).toBe('a=1');
  });
});
