import { describe, expect, it } from 'vitest';
import { computeCodeChallenge, generateCodeVerifier } from "./pkce-generator-logic.js";

describe('generateCodeVerifier', () => {
  it('generates a verifier of the requested length', () => {
    expect(generateCodeVerifier(64)).toHaveLength(64);
  });

  it('clamps below the RFC 7636 minimum (43)', () => {
    expect(generateCodeVerifier(10)).toHaveLength(43);
  });

  it('clamps above the RFC 7636 maximum (128)', () => {
    expect(generateCodeVerifier(200)).toHaveLength(128);
  });

  it('only uses the RFC 7636 unreserved character set', () => {
    const verifier = generateCodeVerifier(128);
    expect(verifier).toMatch(/^[A-Za-z0-9\-._~]+$/);
  });

  it('generates different verifiers on successive calls', () => {
    expect(generateCodeVerifier(64)).not.toBe(generateCodeVerifier(64));
  });
});

describe('computeCodeChallenge', () => {
  it('matches RFC 7636 Appendix B\'s worked example exactly', async () => {
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const challenge = await computeCodeChallenge(verifier, 'S256');
    expect(challenge).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });

  it('returns the verifier unchanged for the "plain" method', async () => {
    const verifier = generateCodeVerifier(50);
    expect(await computeCodeChallenge(verifier, 'plain')).toBe(verifier);
  });
});
