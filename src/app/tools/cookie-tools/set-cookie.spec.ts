import { EMPTY_SET_COOKIE, buildSetCookieHeader, checkSetCookieWarnings, parseSetCookieHeader } from './set-cookie';

describe('parseSetCookieHeader', () => {
  it('matches RFC 6265 Section 3.1 SID cookie example', () => {
    const parsed = parseSetCookieHeader('SID=31d4d96e407aad42; Path=/; Secure; HttpOnly');
    expect(parsed).toEqual({ ...EMPTY_SET_COOKIE, name: 'SID', value: '31d4d96e407aad42', path: '/', secure: true, httpOnly: true });
    expect(buildSetCookieHeader(parsed)).toBe('SID=31d4d96e407aad42; Path=/; Secure; HttpOnly');
  });

  it('parses name/value plus every attribute', () => {
    const result = parseSetCookieHeader('session=abc123; Domain=example.com; Path=/; Max-Age=3600; Secure; HttpOnly; SameSite=Lax');
    expect(result).toEqual({
      name: 'session',
      value: 'abc123',
      domain: 'example.com',
      path: '/',
      expires: '',
      maxAge: '3600',
      secure: true,
      httpOnly: true,
      sameSite: 'Lax',
    });
  });

  it('is case-insensitive for attribute names and SameSite values', () => {
    const result = parseSetCookieHeader('a=1; DOMAIN=x.com; samesite=strict; secure');
    expect(result.domain).toBe('x.com');
    expect(result.sameSite).toBe('Strict');
    expect(result.secure).toBe(true);
  });

  it('returns EMPTY_SET_COOKIE for empty input', () => {
    expect(parseSetCookieHeader('')).toEqual(EMPTY_SET_COOKIE);
  });

  it('handles a bare name=value with no attributes', () => {
    expect(parseSetCookieHeader('a=1')).toEqual({ ...EMPTY_SET_COOKIE, name: 'a', value: '1' });
  });
});

describe('buildSetCookieHeader', () => {
  it('builds a header including only the attributes that are set', () => {
    expect(buildSetCookieHeader({ ...EMPTY_SET_COOKIE, name: 'a', value: '1', secure: true, sameSite: 'Lax' })).toBe(
      'a=1; Secure; SameSite=Lax',
    );
  });

  it('returns an empty string when there is no name', () => {
    expect(buildSetCookieHeader(EMPTY_SET_COOKIE)).toBe('');
  });

  it('round-trips through parseSetCookieHeader', () => {
    const original = { ...EMPTY_SET_COOKIE, name: 'session', value: 'abc', domain: 'x.com', path: '/a', maxAge: '60', httpOnly: true };
    expect(parseSetCookieHeader(buildSetCookieHeader(original))).toEqual(original);
  });
});

describe('checkSetCookieWarnings', () => {
  it('flags SameSite=None without Secure', () => {
    const warnings = checkSetCookieWarnings({ ...EMPTY_SET_COOKIE, name: 'a', sameSite: 'None' });
    expect(warnings.some((w) => w.includes('SameSite=None'))).toBe(true);
  });

  it('does not flag SameSite=None when Secure is also set', () => {
    const warnings = checkSetCookieWarnings({ ...EMPTY_SET_COOKIE, name: 'a', sameSite: 'None', secure: true });
    expect(warnings.some((w) => w.includes('SameSite=None'))).toBe(false);
  });

  it('flags both Expires and Max-Age being set', () => {
    const warnings = checkSetCookieWarnings({ ...EMPTY_SET_COOKIE, name: 'a', expires: 'Wed, 21 Oct 2026 07:28:00 GMT', maxAge: '60' });
    expect(warnings.some((w) => w.includes('Max-Age takes precedence'))).toBe(true);
  });

  it('flags an unparseable Expires value', () => {
    const warnings = checkSetCookieWarnings({ ...EMPTY_SET_COOKIE, name: 'a', expires: 'not a date' });
    expect(warnings.some((w) => w.includes('recognizable date'))).toBe(true);
  });

  it('flags a non-numeric Max-Age value', () => {
    const warnings = checkSetCookieWarnings({ ...EMPTY_SET_COOKIE, name: 'a', maxAge: 'soon' });
    expect(warnings.some((w) => w.includes('whole number of seconds'))).toBe(true);
  });

  it('returns no warnings for a clean, well-formed cookie', () => {
    expect(checkSetCookieWarnings({ ...EMPTY_SET_COOKIE, name: 'a', value: '1', secure: true, sameSite: 'Strict' })).toEqual([]);
  });
});
