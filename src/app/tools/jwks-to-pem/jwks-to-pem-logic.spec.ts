import { describe, expect, it } from 'vitest';
import { exportJWK, generateKeyPair } from 'jose';
import { convertAllToPem, convertJwkToPem, parseJwksKeys } from './jwks-to-pem-logic';

async function makeJwk(kid: string) {
  const { publicKey } = await generateKeyPair('RS256', { extractable: true });
  const jwk = await exportJWK(publicKey);
  return { ...jwk, kid, alg: 'RS256' };
}

describe('parseJwksKeys', () => {
  it('rejects empty input', () => {
    expect(parseJwksKeys('').ok).toBe(false);
  });

  it('rejects invalid JSON', () => {
    expect(parseJwksKeys('{not json').ok).toBe(false);
  });

  it('rejects a document without a "keys" array', () => {
    expect(parseJwksKeys('{}').ok).toBe(false);
  });

  it('rejects an empty "keys" array', () => {
    expect(parseJwksKeys('{"keys": []}').ok).toBe(false);
  });

  it('parses a valid JWKS', async () => {
    const jwk = await makeJwk('key-1');
    const result = parseJwksKeys(JSON.stringify({ keys: [jwk] }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.keys).toHaveLength(1);
    expect(result.keys[0].kid).toBe('key-1');
  });
});

describe('convertJwkToPem - RFC 7517 Appendix A.1 known-answer vector', () => {
  it('exports the published RSA public JWK to PEM with identical modulus and exponent', async () => {
    const jwk = { kty: 'RSA', n: '0vx7agoebGcQSuuPiLJXZptN9nndrQmbXEps2aiAFbWhM78LhWx4cbbfAAtVT86zwu1RK7aPFFxuhDR1L6tSoc_BJECPebWKRXjBZCiFV4n3oknjhMstn64tZ_2W-5JsGY4Hc5n9yBXArwl93lqt7_RN5w6Cf0h4QyQ5v-65YGjQR0_FDW2QvzqY368QQMicAtaSqzs8KJZgnYb9c7d0zgdAZHzu6qMQvRL5hajrn1n91CbOpbISD08qNLyrdkt-bFTWhAI4vMQFh6WeZu0fM4lFd2NcRwr3XPksINHaQ-G_xBniIqbw0Ls1jF44-csFCur-kEgU8awapJzKnqDKgw', e: 'AQAB', alg: 'RS256', kid: '2011-04-29' };
    const result = await convertJwkToPem(jwk, 'RS256');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { createPublicKey } = await import('node:crypto');
    const converted = createPublicKey(result.pem).export({ format: 'jwk' }) as Record<string, unknown>;
    expect(converted['n']).toBe(jwk.n);
    expect(converted['e']).toBe(jwk.e);
  });
});

describe('convertJwkToPem', () => {
  it('converts an RSA JWK to a SPKI PEM public key', async () => {
    const jwk = await makeJwk('key-1');
    const result = await convertJwkToPem(jwk, 'RS256');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pem).toContain('-----BEGIN PUBLIC KEY-----');
  });

  it('rejects a symmetric ("oct") key', async () => {
    const result = await convertJwkToPem({ kty: 'oct', k: 'c2VjcmV0' }, 'HS256');
    expect(result.ok).toBe(false);
  });

  it('rejects a malformed key', async () => {
    const result = await convertJwkToPem({ kty: 'RSA' });
    expect(result.ok).toBe(false);
  });
});

describe('convertAllToPem', () => {
  it('converts every key in a batch', async () => {
    const a = await makeJwk('a');
    const b = await makeJwk('b');
    const results = await convertAllToPem([
      { raw: a, kty: 'RSA', alg: 'RS256', kid: 'a' },
      { raw: b, kty: 'RSA', alg: 'RS256', kid: 'b' },
    ]);
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.ok)).toBe(true);
  });
});

describe('convertJwkToPem — cross-checked against an independent implementation', () => {
  // DUDE_PRD.md §21 Phase 23 Item 3 -- makeJwk above generates its JWK with jose too, so
  // converting it back with jose's exportSPKI never leaves jose's own code. This generates the
  // JWK with Node's `crypto` module instead (a fully independent implementation), then confirms
  // the PEM DUDE/jose produces round-trips through Node's own PEM importer back to the identical
  // modulus/exponent.
  it("converts a Node-crypto-generated JWK to a PEM Node's own crypto can re-import identically", async () => {
    const { generateKeyPairSync } = await import('node:crypto');
    const { publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const nodeJwk = publicKey.export({ format: 'jwk' }) as Record<string, unknown>;

    const result = await convertJwkToPem(nodeJwk, 'RS256');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { createPublicKey } = await import('node:crypto');
    const reimported = createPublicKey(result.pem).export({ format: 'jwk' }) as Record<string, unknown>;
    expect(reimported['n']).toBe(nodeJwk['n']);
    expect(reimported['e']).toBe(nodeJwk['e']);
  });
});
