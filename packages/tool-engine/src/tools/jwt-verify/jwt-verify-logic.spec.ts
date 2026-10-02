import { SignJWT, base64url, exportSPKI, generateKeyPair, importJWK } from 'jose';
import { verifyJwt } from "./jwt-verify-logic.js";

/**
 * Signs test fixtures via a JWK-imported key rather than a raw Uint8Array
 * passed straight to `.sign()` — mirrors the same realm-safety reasoning as
 * `jwt-verify-logic.ts`'s own HMAC key resolution (see the comment there).
 */
async function hmacKey(secret: string, alg: string) {
  const k = base64url.encode(new TextEncoder().encode(secret));
  return importJWK({ kty: 'oct', k }, alg);
}

describe('verifyJwt - RFC 7515 Appendix A.2 known-answer vector', () => {
  it('validates the published RS256 signature with RFC 7517 Appendix A.1 public JWK before reporting its expired claim', async () => {
    const token = [
      'eyJhbGciOiJSUzI1NiJ9',
      'eyJpc3MiOiJqb2UiLA0KICJleHAiOjEzMDA4MTkzODAsDQogImh0dHA6Ly9leGFtcGxlLmNvbS9pc19yb290Ijp0cnVlfQ',
      'cC4hiUPoj9Eetdgtv3hF80EGrhuB__dzERat0XF9g2VtQgr9PJbu3XOiZj5RZmh7AAuHIm4Bh-0Qc_lF5YKt_O8W2Fp5jujGbds9uJdbF9CUAr7t1dnZcAcQjbKBYNX4BAynRFdiuB--f_nZLgrnbyTyWzO75vRK5h6xBArLIARNPvkSjtQBMHlb1L07Qe7K0GarZRmB_eSN9383LcOLn6_dO--xi12jzDwusC-eOkHWEsqtFZESc6BfI7noOPqvhJ1phCnvWh6IeYI2w9QOYEUipUTI8np6LbgGY9Fs98rqVt5AXLIhWkWywlVmtVrBp0igcN_IoypGlUPQGe77Rw',
    ].join('.');
    const publicJwk = { kty: 'RSA', n: 'ofgWCuLjybRlzo0tZWJjNiuSfb4p4fAkd_wWJcyQoTbji9k0l8W26mPddxHmfHQp-Vaw-4qPCJrcS2mJPMEzP1Pt0Bm4d4QlL-yRT-SFd2lZS-pCgNMsD1W_YpRPEwOWvG6b32690r2jZ47soMZo9wGzjb_7OMg0LOL-bSf63kpaSHSXndS5z5rexMdbBYUsLA9e-KXBdQOS-UTo7WTBEMa2R2CapHg665xsmtdVMTBQY4uDZlxvb3qCo5ZwKh9kG4LT6_I5IhlJH7aGhyxXFvUK-DWNmoudF8NAco9_h9iaGNj8q2ethFkMLs91kzk2PAcDTW9gb54h4FRWyuXpoQ', e: 'AQAB', alg: 'RS256', kid: '2011-04-29' };
    const result = await verifyJwt({ token, mode: 'public-key', algorithm: 'RS256', keyMaterial: JSON.stringify(publicJwk), keyFormat: 'jwk' });
    // jose reports JWTExpired only after successful signature verification.
    expect(result).toEqual({ ok: false, error: 'The signature is valid, but the token has expired ("exp" claim).' });
  });
});

describe('verifyJwt — HMAC', () => {
  it('verifies a token signed with the matching secret', async () => {
    const key = await hmacKey('super-secret', 'HS256');
    const token = await new SignJWT({ sub: 'alice' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .sign(key);

    const result = await verifyJwt({ token, mode: 'hmac', algorithm: 'HS256', secret: 'super-secret' });

    expect(result.ok).toBe(true);
    expect(result.ok && (result.payload as { sub: string }).sub).toBe('alice');
  });

  it('fails verification with the wrong secret', async () => {
    const key = await hmacKey('super-secret', 'HS256');
    const token = await new SignJWT({ sub: 'alice' }).setProtectedHeader({ alg: 'HS256' }).sign(key);

    const result = await verifyJwt({ token, mode: 'hmac', algorithm: 'HS256', secret: 'wrong-secret' });

    expect(result.ok).toBe(false);
  });

  it('requires a secret to be provided', async () => {
    const result = await verifyJwt({ token: 'a.b.c', mode: 'hmac', algorithm: 'HS256' });
    expect(result).toEqual({ ok: false, error: 'Enter the shared secret.' });
  });
});

describe('verifyJwt — public key', () => {
  it('verifies an RS256 token against the matching SPKI PEM public key', async () => {
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    const token = await new SignJWT({ sub: 'bob' }).setProtectedHeader({ alg: 'RS256' }).sign(privateKey);
    const pem = await exportSPKI(publicKey);

    const result = await verifyJwt({
      token,
      mode: 'public-key',
      algorithm: 'RS256',
      keyMaterial: pem,
      keyFormat: 'pem',
    });

    expect(result.ok).toBe(true);
  });

  it('verifies an ES256 token', async () => {
    const { publicKey, privateKey } = await generateKeyPair('ES256');
    const token = await new SignJWT({ sub: 'carol' }).setProtectedHeader({ alg: 'ES256' }).sign(privateKey);
    const pem = await exportSPKI(publicKey);

    const result = await verifyJwt({
      token,
      mode: 'public-key',
      algorithm: 'ES256',
      keyMaterial: pem,
      keyFormat: 'pem',
    });

    expect(result.ok).toBe(true);
  });

  it('rejects verifying an RS256 token as HS256 using the public key as a secret (algorithm confusion)', async () => {
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    const token = await new SignJWT({ sub: 'mallory' }).setProtectedHeader({ alg: 'RS256' }).sign(privateKey);
    const pem = await exportSPKI(publicKey);

    const result = await verifyJwt({ token, mode: 'hmac', algorithm: 'HS256', secret: pem });

    expect(result.ok).toBe(false);
  });
});

describe('verifyJwt — JWKS', () => {
  it('fetches the JWKS, matches by kid, and verifies', async () => {
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    const jwk = await (await import('jose')).exportJWK(publicKey);
    const kid = 'key-1';
    const token = await new SignJWT({ sub: 'dave' })
      .setProtectedHeader({ alg: 'RS256', kid })
      .sign(privateKey);

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ keys: [{ ...jwk, kid }] }),
      }),
    );

    const result = await verifyJwt({ token, mode: 'jwks', algorithm: 'RS256', jwksUrl: 'https://example.com/jwks.json' });

    expect(result.ok).toBe(true);
    vi.unstubAllGlobals();
  });

  it('reports a clear error when no key in the JWKS matches the kid', async () => {
    const { privateKey } = await generateKeyPair('RS256');
    const token = await new SignJWT({ sub: 'dave' })
      .setProtectedHeader({ alg: 'RS256', kid: 'missing' })
      .sign(privateKey);

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ keys: [] }),
      }),
    );

    const result = await verifyJwt({ token, mode: 'jwks', algorithm: 'RS256', jwksUrl: 'https://example.com/jwks.json' });

    expect(result.ok).toBe(false);
    vi.unstubAllGlobals();
  });

  it('reports a network-flavored error when the fetch rejects', async () => {
    const { privateKey } = await generateKeyPair('RS256');
    const token = await new SignJWT({ sub: 'dave' }).setProtectedHeader({ alg: 'RS256' }).sign(privateKey);

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    const result = await verifyJwt({ token, mode: 'jwks', algorithm: 'RS256', jwksUrl: 'https://example.com/jwks.json' });

    expect(result.ok).toBe(false);
    expect(result.ok || result.error).toContain('CORS');
    vi.unstubAllGlobals();
  });

  it('requires a JWKS URL to be provided', async () => {
    const result = await verifyJwt({ token: 'a.b.c', mode: 'jwks', algorithm: 'RS256' });
    expect(result).toEqual({ ok: false, error: 'Enter a JWKS URL.' });
  });
});

describe('verifyJwt — general', () => {
  it('rejects an empty token', async () => {
    const result = await verifyJwt({ token: '', mode: 'hmac', algorithm: 'HS256', secret: 'x' });
    expect(result).toEqual({ ok: false, error: 'Enter a JWT.' });
  });
});

describe('verifyJwt — cross-checked against an independent HS256 implementation', () => {
  // DUDE_PRD.md §21 Phase 23 Item 3 -- every other test in this file signs with `jose`'s own
  // SignJWT and verifies with DUDE's jose-based verifyJwt, which never proves anything against a
  // second, independent implementation. This token is built by hand with Node's `crypto` module
  // (HMAC-SHA256 over the raw compact-serialization bytes, per RFC 7515 §5.1), never touching
  // jose at all on the signing side.
  it('verifies a token signed by hand with Node crypto.createHmac', async () => {
    const { createHmac } = await import('node:crypto');
    const base64url = (bytes: Uint8Array) =>
      Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    const header = base64url(new TextEncoder().encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
    const payload = base64url(new TextEncoder().encode(JSON.stringify({ sub: 'carol' })));
    const signingInput = `${header}.${payload}`;
    const signature = createHmac('sha256', 'independent-secret').update(signingInput).digest();
    const token = `${signingInput}.${base64url(signature)}`;

    const result = await verifyJwt({ token, mode: 'hmac', algorithm: 'HS256', secret: 'independent-secret' });

    expect(result.ok).toBe(true);
    expect(result.ok && (result.payload as { sub: string }).sub).toBe('carol');
  });

  it('rejects the same token with one signature byte flipped', async () => {
    const { createHmac } = await import('node:crypto');
    const base64url = (bytes: Uint8Array) =>
      Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    const header = base64url(new TextEncoder().encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
    const payload = base64url(new TextEncoder().encode(JSON.stringify({ sub: 'carol' })));
    const signingInput = `${header}.${payload}`;
    const signature = createHmac('sha256', 'independent-secret').update(signingInput).digest();
    signature[0] ^= 0xff;
    const token = `${signingInput}.${base64url(signature)}`;

    const result = await verifyJwt({ token, mode: 'hmac', algorithm: 'HS256', secret: 'independent-secret' });
    expect(result.ok).toBe(false);
  });
});
