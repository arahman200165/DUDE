import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { generateKeyPair, exportJWK } from 'jose';
import { parseJwks } from "./jwks-viewer-logic.js";

async function makeJwk(kid: string) {
  const { publicKey } = await generateKeyPair('RS256', { extractable: true });
  const jwk = await exportJWK(publicKey);
  return { ...jwk, kid, alg: 'RS256', use: 'sig' };
}

// RFC 7638 thumbprints are outside this viewer's behavior; it reports source JWK fields and importability only.
describe('parseJwks - RFC 7517 Appendix A.1 known-answer vector', () => {
  it('recognizes the published RS256 public key and key id as importable', async () => {
    const jwk = { kty: 'RSA', n: '0vx7agoebGcQSuuPiLJXZptN9nndrQmbXEps2aiAFbWhM78LhWx4cbbfAAtVT86zwu1RK7aPFFxuhDR1L6tSoc_BJECPebWKRXjBZCiFV4n3oknjhMstn64tZ_2W-5JsGY4Hc5n9yBXArwl93lqt7_RN5w6Cf0h4QyQ5v-65YGjQR0_FDW2QvzqY368QQMicAtaSqzs8KJZgnYb9c7d0zgdAZHzu6qMQvRL5hajrn1n91CbOpbISD08qNLyrdkt-bFTWhAI4vMQFh6WeZu0fM4lFd2NcRwr3XPksINHaQ-G_xBniIqbw0Ls1jF44-csFCur-kEgU8awapJzKnqDKgw', e: 'AQAB', alg: 'RS256', kid: '2011-04-29' };
    const result = await parseJwks(JSON.stringify({ keys: [jwk] }));
    expect(result).toEqual({ ok: true, keys: [{ raw: jwk, kty: 'RSA', alg: 'RS256', kid: '2011-04-29', importable: true, warnings: [] }] });
  });
});

describe('parseJwks', () => {
  it('rejects empty input', async () => {
    const result = await parseJwks('');
    expect(result.ok).toBe(false);
  });

  it('rejects invalid JSON', async () => {
    const result = await parseJwks('{not json');
    expect(result.ok).toBe(false);
  });

  it('rejects a document without a "keys" array', async () => {
    const result = await parseJwks('{"foo": "bar"}');
    expect(result.ok).toBe(false);
  });

  it('rejects an empty "keys" array', async () => {
    const result = await parseJwks('{"keys": []}');
    expect(result.ok).toBe(false);
  });

  it('parses a valid JWKS and reports importable keys', async () => {
    const jwk = await makeJwk('key-1');
    const result = await parseJwks(JSON.stringify({ keys: [jwk] }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.keys).toHaveLength(1);
    expect(result.keys[0].kid).toBe('key-1');
    expect(result.keys[0].kty).toBe('RSA');
    expect(result.keys[0].importable).toBe(true);
    expect(result.keys[0].warnings).toHaveLength(0);
  });

  it('flags a missing kid', async () => {
    const jwk = await makeJwk('key-1');
    delete (jwk as Record<string, unknown>)['kid'];
    const result = await parseJwks(JSON.stringify({ keys: [jwk] }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.keys[0].warnings.some((w) => w.includes('Missing "kid"'))).toBe(true);
  });

  it('flags duplicate kids across the set', async () => {
    const a = await makeJwk('shared');
    const b = await makeJwk('shared');
    const result = await parseJwks(JSON.stringify({ keys: [a, b] }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.keys.every((k) => k.warnings.some((w) => w.includes('Duplicate "kid"')))).toBe(true);
  });

  it('flags a symmetric ("oct") key in a JWKS', async () => {
    const result = await parseJwks(JSON.stringify({ keys: [{ kty: 'oct', k: 'c2VjcmV0', kid: 'sym' }] }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.keys[0].warnings.some((w) => w.includes('Symmetric'))).toBe(true);
  });

  it('flags an entry that is not an object', async () => {
    const result = await parseJwks(JSON.stringify({ keys: ['not-an-object'] }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.keys[0].warnings[0]).toContain('not a JSON object');
  });
});

describe('fuzzing (DUDE_PRD.md §21 Phase 23 Item 5)', () => {
  it('never rejects for arbitrary text input', async () => {
    await fc.assert(
      fc.asyncProperty(fc.string(), async (text) => {
        const result = await parseJwks(text);
        expect(typeof result.ok).toBe('boolean');
      }),
    );
  });

  it('never rejects for an arbitrary JSON "keys" array of arbitrary entries', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(fc.anything()), async (keys) => {
        const result = await parseJwks(JSON.stringify({ keys }));
        expect(typeof result.ok).toBe('boolean');
      }),
    );
  });
});
