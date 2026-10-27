import { describe, expect, it } from 'vitest';
import { codeChallengeS256, constantTimeEqual, generateCodeVerifier, generateNonce, generateState, isValidCodeVerifier, isWellFormedToken, sha256Hex } from './pkce.js';

describe('PKCE S256', () => {
  it('matches the RFC 7636 Appendix B test vector', () => {
    expect(codeChallengeS256('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });

  it('produces an unpadded base64url challenge of 43 characters', () => {
    const challenge = codeChallengeS256(generateCodeVerifier());
    expect(challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('accepts exactly the RFC 7636 verifier alphabet and length', () => {
    expect(isValidCodeVerifier('a'.repeat(43))).toBe(true);
    expect(isValidCodeVerifier('a'.repeat(128))).toBe(true);
    expect(isValidCodeVerifier('a'.repeat(42))).toBe(false);
    expect(isValidCodeVerifier('a'.repeat(129))).toBe(false);
    expect(isValidCodeVerifier(`${'a'.repeat(42)}!`)).toBe(false);
    expect(isValidCodeVerifier(`${'a'.repeat(42)}=`)).toBe(false);
  });
});

describe('verifier, state and nonce generation', () => {
  it('are 256-bit base64url tokens (43 characters), valid verifiers, and never repeat', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i += 1) {
      for (const make of [generateCodeVerifier, generateState, generateNonce]) {
        const value = make();
        expect(value).toMatch(/^[A-Za-z0-9_-]{43}$/);
        expect(isValidCodeVerifier(value)).toBe(true);
        expect(seen.has(value)).toBe(false);
        seen.add(value);
      }
    }
  });

  it('draw on the whole alphabet (not a constant or a counter)', () => {
    const characters = new Set<string>();
    for (let i = 0; i < 200; i += 1) for (const ch of generateState()) characters.add(ch);
    expect(characters.size).toBeGreaterThan(55);
  });
});

describe('token shape and hashing', () => {
  it('isWellFormedToken refuses non-strings, short, long and out-of-alphabet values before any lookup', () => {
    expect(isWellFormedToken(generateState(), 32, 128)).toBe(true);
    for (const bad of [undefined, null, 42, {}, '', 'short', 'x'.repeat(300), `${generateState()}!`, `${generateState()} `, `${generateState()}\n`]) expect(isWellFormedToken(bad, 32, 128)).toBe(false);
  });

  it('sha256Hex is the lowercase hex SHA-256', () => {
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('constantTimeEqual compares by value, across lengths, without throwing', () => {
    expect(constantTimeEqual('same', 'same')).toBe(true);
    expect(constantTimeEqual('same', 'sama')).toBe(false);
    expect(constantTimeEqual('same', 'same-and-more')).toBe(false);
    expect(constantTimeEqual('', '')).toBe(true);
    expect(constantTimeEqual('', 'x')).toBe(false);
  });
});
