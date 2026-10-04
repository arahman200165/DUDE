import { createHash, createPublicKey, generateKeyPairSync, verify } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { base64url, jwkOf, jwkThumbprint, keyAuthorization, signJws } from './jws.js';

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });

describe('jws', () => {
  it('exports a canonical P-256 JWK from a public or private key', () => {
    const jwk = jwkOf(privateKey);
    expect(Object.keys(jwk).sort()).toEqual(['crv', 'kty', 'x', 'y']);
    expect(jwk.crv).toBe('P-256');
    expect(jwkOf(publicKey)).toEqual(jwk);
  });

  it('rejects non-P-256 keys', () => {
    const other = generateKeyPairSync('ec', { namedCurve: 'P-384' }).privateKey;
    expect(() => jwkOf(other)).toThrow(/P-256/);
  });

  it('computes the RFC 7638 thumbprint over the canonical member order', () => {
    const jwk = { crv: 'P-256', kty: 'EC', x: 'f83OJ3D2xF1Bg8vub9tLe1gHMzV76e8Tus9uPHvRVEU', y: 'x_FEzRu9m36HLN_tue659LNpXW6pCyStikYjKIWI5a0' } as const;
    const expected = createHash('sha256')
      .update('{"crv":"P-256","kty":"EC","x":"f83OJ3D2xF1Bg8vub9tLe1gHMzV76e8Tus9uPHvRVEU","y":"x_FEzRu9m36HLN_tue659LNpXW6pCyStikYjKIWI5a0"}')
      .digest('base64url');
    expect(jwkThumbprint(jwk)).toBe(expected);
    // Member order in the input object must not matter.
    expect(jwkThumbprint({ y: jwk.y, x: jwk.x, kty: 'EC', crv: 'P-256' })).toBe(expected);
    expect(keyAuthorization('tok', jwk)).toBe(`tok.${expected}`);
  });

  it('signs a flattened JWS with an IEEE-P1363 signature that verifies', () => {
    const header = { alg: 'ES256', nonce: 'n', url: 'https://ca.test/x', jwk: jwkOf(privateKey) };
    const jws = signJws({ key: privateKey, protectedHeader: header, payload: { a: 1 } });
    expect(JSON.parse(Buffer.from(jws.protected, 'base64url').toString())).toEqual(header);
    expect(JSON.parse(Buffer.from(jws.payload, 'base64url').toString())).toEqual({ a: 1 });
    const signature = Buffer.from(jws.signature, 'base64url');
    expect(signature.length).toBe(64);
    const key = createPublicKey({ key: header.jwk, format: 'jwk' });
    expect(verify('sha256', Buffer.from(`${jws.protected}.${jws.payload}`), { key, dsaEncoding: 'ieee-p1363' }, signature)).toBe(true);
    expect(verify('sha256', Buffer.from(`${jws.protected}.${base64url('{"a":2}')}`), { key, dsaEncoding: 'ieee-p1363' }, signature)).toBe(false);
  });

  it('uses an empty payload for POST-as-GET', () => {
    const jws = signJws({ key: privateKey, protectedHeader: { alg: 'ES256' }, payload: '' });
    expect(jws.payload).toBe('');
    const key = publicKey;
    expect(verify('sha256', Buffer.from(`${jws.protected}.`), { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(jws.signature, 'base64url'))).toBe(true);
  });
});
