import { jwtVerify, importJWK, base64url } from 'jose';
import { generateSigningKeyPair, signJwt } from './jwt-signer-logic';

describe('signJwt — HMAC', () => {
  it('signs claims and produces a token verifiable with the same secret', async () => {
    const result = await signJwt({
      claimsJson: JSON.stringify({ sub: 'alice' }),
      mode: 'hmac',
      algorithm: 'HS256',
      secret: 'super-secret',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const k = base64url.encode(new TextEncoder().encode('super-secret'));
    const key = await importJWK({ kty: 'oct', k }, 'HS256');
    const verified = await jwtVerify(result.token, key, { algorithms: ['HS256'] });
    expect((verified.payload as { sub: string }).sub).toBe('alice');
  });

  it('requires a secret', async () => {
    const result = await signJwt({ claimsJson: '{}', mode: 'hmac', algorithm: 'HS256' });
    expect(result).toEqual({ ok: false, error: 'Enter the shared secret.' });
  });

  it('rejects invalid JSON claims', async () => {
    const result = await signJwt({ claimsJson: '{not json', mode: 'hmac', algorithm: 'HS256', secret: 's' });
    expect(result).toEqual({ ok: false, error: 'Claims must be valid JSON.' });
  });

  it('rejects non-object claims', async () => {
    const result = await signJwt({ claimsJson: '[1,2,3]', mode: 'hmac', algorithm: 'HS256', secret: 's' });
    expect(result).toEqual({ ok: false, error: 'Claims must be a JSON object.' });
  });

  it('requires an algorithm', async () => {
    const result = await signJwt({ claimsJson: '{}', mode: 'hmac', algorithm: '', secret: 's' });
    expect(result).toEqual({ ok: false, error: 'Select an algorithm.' });
  });
});

describe('signJwt — private key', () => {
  it('signs with a generated key pair and verifies against its public key', async () => {
    const pair = await generateSigningKeyPair('RS256');
    const result = await signJwt({
      claimsJson: JSON.stringify({ sub: 'bob' }),
      mode: 'private-key',
      algorithm: 'RS256',
      keyMaterial: pair.privateKeyPem,
      keyFormat: 'pem',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const publicKey = await importJWK(JSON.parse(pair.publicKeyJwk), 'RS256');
    const verified = await jwtVerify(result.token, publicKey, { algorithms: ['RS256'] });
    expect((verified.payload as { sub: string }).sub).toBe('bob');
  });

  it('signs with a pasted JWK private key', async () => {
    const pair = await generateSigningKeyPair('ES256');
    const result = await signJwt({
      claimsJson: JSON.stringify({ sub: 'carol' }),
      mode: 'private-key',
      algorithm: 'ES256',
      keyMaterial: pair.privateKeyJwk,
      keyFormat: 'jwk',
    });
    expect(result.ok).toBe(true);
  });

  it('requires key material', async () => {
    const result = await signJwt({ claimsJson: '{}', mode: 'private-key', algorithm: 'RS256', keyFormat: 'pem' });
    expect(result).toEqual({ ok: false, error: 'Enter a private key (PEM or JWK), or generate one below.' });
  });
});

describe('generateSigningKeyPair', () => {
  it('generates a usable RSA key pair', async () => {
    const pair = await generateSigningKeyPair('RS256');
    expect(pair.privateKeyPem).toContain('BEGIN PRIVATE KEY');
    expect(pair.publicKeyPem).toContain('BEGIN PUBLIC KEY');
    expect(JSON.parse(pair.privateKeyJwk).kty).toBe('RSA');
  });

  it('generates a usable EC key pair', async () => {
    const pair = await generateSigningKeyPair('ES256');
    expect(JSON.parse(pair.publicKeyJwk).kty).toBe('EC');
  });
});

describe('signJwt — cross-checked against an independent HS256 implementation', () => {
  // DUDE_PRD.md §21 Phase 23 Item 3 -- the HMAC test above signs with signJwt and verifies with
  // jose's own jwtVerify, which never proves anything against a second, independent
  // implementation. This recomputes the HMAC-SHA256 signature by hand with Node's `crypto`
  // module (per RFC 7515 §5.1: HMAC over the raw compact-serialization header.payload bytes) and
  // checks it matches the signature signJwt actually produced, byte for byte.
  it("recomputes the signature with Node's crypto.createHmac and gets an identical result", async () => {
    const result = await signJwt({
      claimsJson: JSON.stringify({ sub: 'dave' }),
      mode: 'hmac',
      algorithm: 'HS256',
      secret: 'independent-secret',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const [header, payload, signature] = result.token.split('.');
    const { createHmac } = await import('node:crypto');
    const expectedSignature = createHmac('sha256', 'independent-secret')
      .update(`${header}.${payload}`)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    expect(signature).toBe(expectedSignature);
  });
});
