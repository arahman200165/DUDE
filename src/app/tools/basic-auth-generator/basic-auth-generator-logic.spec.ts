import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { buildBasicAuthHeader, decodeBasicAuthHeader } from './basic-auth-generator-logic';

describe('buildBasicAuthHeader', () => {
  it('builds a standard-base64 Basic auth header', () => {
    const result = buildBasicAuthHeader('Aladdin', 'open sesame');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBe('Basic QWxhZGRpbjpvcGVuIHNlc2FtZQ==');
  });

  it('rejects an empty username', () => {
    expect(buildBasicAuthHeader('', 'password').ok).toBe(false);
  });

  it('rejects a username containing a colon', () => {
    expect(buildBasicAuthHeader('user:name', 'password').ok).toBe(false);
  });

  it('allows an empty password', () => {
    const result = buildBasicAuthHeader('user', '');
    expect(result.ok).toBe(true);
  });

  it('round-trips non-ASCII credentials', () => {
    const built = buildBasicAuthHeader('üser', 'pässwörd');
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const decoded = decodeBasicAuthHeader(built.value);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.value).toEqual({ username: 'üser', password: 'pässwörd' });
  });
});

describe('decodeBasicAuthHeader', () => {
  it('decodes a full "Basic ..." header', () => {
    const result = decodeBasicAuthHeader('Basic QWxhZGRpbjpvcGVuIHNlc2FtZQ==');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({ username: 'Aladdin', password: 'open sesame' });
  });

  it('decodes a bare Base64 payload without the "Basic " prefix', () => {
    const result = decodeBasicAuthHeader('QWxhZGRpbjpvcGVuIHNlc2FtZQ==');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.username).toBe('Aladdin');
  });

  it('rejects invalid Base64', () => {
    expect(decodeBasicAuthHeader('Basic !!!not-base64!!!').ok).toBe(false);
  });

  it('rejects a decoded value with no colon separator', () => {
    const noColon = btoa('nocolonhere');
    expect(decodeBasicAuthHeader(`Basic ${noColon}`).ok).toBe(false);
  });

  it('rejects empty input', () => {
    expect(decodeBasicAuthHeader('').ok).toBe(false);
  });
});

describe('round-trip property (DUDE_PRD.md §21 Phase 23 Item 4)', () => {
  it('decodeBasicAuthHeader(buildBasicAuthHeader(u, p)) recovers u and p for any colon-free username', () => {
    fc.assert(
      fc.property(
        fc.string().filter((s) => s !== '' && !s.includes(':')),
        fc.string(),
        (username, password) => {
          const built = buildBasicAuthHeader(username, password);
          expect(built.ok).toBe(true);
          if (!built.ok) return;
          const decoded = decodeBasicAuthHeader(built.value);
          expect(decoded).toEqual({ ok: true, value: { username, password } });
        },
      ),
    );
  });
});
