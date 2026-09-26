import fc from 'fast-check';
import { decodeJwt, decodeTemporalClaim } from './jwt-decode';

function toBase64Url(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function buildToken(header: unknown, payload: unknown, signature = 'sig'): string {
  return `${toBase64Url(header)}.${toBase64Url(payload)}.${signature}`;
}

describe('decodeJwt', () => {
  it('decodes the published RFC 7515 Appendix A.2 compact JWS segments', () => {
    // RFC 7515 Appendix A.2 publishes this exact compact RSA JWS. This tool
    // only decodes it; signature authenticity is covered by jwt-verify.
    const token = [
      'eyJhbGciOiJSUzI1NiJ9',
      'eyJpc3MiOiJqb2UiLA0KICJleHAiOjEzMDA4MTkzODAsDQogImh0dHA6Ly9leGFtcGxlLmNvbS9pc19yb290Ijp0cnVlfQ',
      'cC4hiUPoj9Eetdgtv3hF80EGrhuB__dzERat0XF9g2VtQgr9PJbu3XOiZj5RZmh7AAuHIm4Bh-0Qc_lF5YKt_O8W2Fp5jujGbds9uJdbF9CUAr7t1dnZcAcQjbKBYNX4BAynRFdiuB--f_nZLgrnbyTyWzO75vRK5h6xBArLIARNPvkSjtQBMHlb1L07Qe7K0GarZRmB_eSN9383LcOLn6_dO--xi12jzDwusC-eOkHWEsqtFZESc6BfI7noOPqvhJ1phCnvWh6IeYI2w9QOYEUipUTI8np6LbgGY9Fs98rqVt5AXLIhWkWywlVmtVrBp0igcN_IoypGlUPQGe77Rw',
    ].join('.');

    const result = decodeJwt(token, new Date('2012-01-01T00:00:00Z'));

    expect(result).toEqual({
      ok: true,
      header: { alg: 'RS256' },
      payload: { iss: 'joe', exp: 1300819380, 'http://example.com/is_root': true },
      signature: 'cC4hiUPoj9Eetdgtv3hF80EGrhuB__dzERat0XF9g2VtQgr9PJbu3XOiZj5RZmh7AAuHIm4Bh-0Qc_lF5YKt_O8W2Fp5jujGbds9uJdbF9CUAr7t1dnZcAcQjbKBYNX4BAynRFdiuB--f_nZLgrnbyTyWzO75vRK5h6xBArLIARNPvkSjtQBMHlb1L07Qe7K0GarZRmB_eSN9383LcOLn6_dO--xi12jzDwusC-eOkHWEsqtFZESc6BfI7noOPqvhJ1phCnvWh6IeYI2w9QOYEUipUTI8np6LbgGY9Fs98rqVt5AXLIhWkWywlVmtVrBp0igcN_IoypGlUPQGe77Rw',
      expiry: { kind: 'expired', expiresAt: new Date(1300819380 * 1000) },
    });
  });
  it('decodes a well-formed token', () => {
    const token = buildToken({ alg: 'HS256', typ: 'JWT' }, { sub: 'abc123' }, 'signature-segment');

    const result = decodeJwt(token);

    expect(result.ok).toBe(true);
    expect(result.ok && result.header).toEqual({ alg: 'HS256', typ: 'JWT' });
    expect(result.ok && result.payload).toEqual({ sub: 'abc123' });
    expect(result.ok && result.signature).toBe('signature-segment');
  });

  it('rejects empty input', () => {
    expect(decodeJwt('').ok).toBe(false);
  });

  it('rejects a token without three segments', () => {
    expect(decodeJwt('only.two').ok).toBe(false);
  });

  it('rejects a token whose payload is not valid Base64url/JSON', () => {
    const token = buildToken({ alg: 'HS256' }, { sub: 'x' });
    const corrupted = `${token.split('.')[0]}.not-valid-json-base64.${token.split('.')[2]}`;

    expect(decodeJwt(corrupted).ok).toBe(false);
  });

  it('rejects a token whose header is not valid Base64url/JSON', () => {
    const token = buildToken({ alg: 'HS256' }, { sub: 'x' });
    const corrupted = `not-valid-json-base64.${token.split('.')[1]}.${token.split('.')[2]}`;

    const result = decodeJwt(corrupted);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain('header');
  });

  it('decodes a token whose payload is a non-object JSON value without throwing', () => {
    const token = buildToken({ alg: 'HS256' }, 'just-a-string');

    const result = decodeJwt(token);

    expect(result.ok).toBe(true);
    expect(result.ok && result.payload).toBe('just-a-string');
    expect(result.ok && result.expiry).toEqual({ kind: 'no-claim' });
  });

  it('reports "no-claim" expiry when there is no exp claim', () => {
    const token = buildToken({ alg: 'HS256' }, { sub: 'abc' });

    const result = decodeJwt(token);

    expect(result.ok && result.expiry).toEqual({ kind: 'no-claim' });
  });

  it('reports "expired" when exp is in the past relative to `now`', () => {
    const token = buildToken({ alg: 'HS256' }, { exp: 1_000_000 });

    const result = decodeJwt(token, new Date(2_000_000_000));

    expect(result.ok && result.expiry.kind).toBe('expired');
  });

  it('reports "valid" when exp is in the future relative to `now`', () => {
    const token = buildToken({ alg: 'HS256' }, { exp: 9_999_999_999 });

    const result = decodeJwt(token, new Date(0));

    expect(result.ok && result.expiry.kind).toBe('valid');
  });
});

describe('decodeTemporalClaim', () => {
  it('converts a numeric claim to a Date', () => {
    expect(decodeTemporalClaim({ iat: 1_700_000_000 }, 'iat')).toEqual(new Date(1_700_000_000_000));
  });

  it('returns null when the claim is missing', () => {
    expect(decodeTemporalClaim({}, 'nbf')).toBeNull();
  });

  it('returns null when the claim is not a number', () => {
    expect(decodeTemporalClaim({ exp: 'soon' }, 'exp')).toBeNull();
  });
});

describe('fuzzing (DUDE_PRD.md §21 Phase 23 Item 5)', () => {
  it('never throws for arbitrary text input', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        expect(() => decodeJwt(input)).not.toThrow();
      }),
    );
  });

  it('never throws for a string shaped like a three-segment token with arbitrary segments', () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), fc.string(), (a, b, c) => {
        expect(() => decodeJwt(`${a}.${b}.${c}`)).not.toThrow();
      }),
    );
  });
});
