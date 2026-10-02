import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { analyzeClaims } from "./jwt-claims-analyzer-logic.js";

const NOW = new Date('2026-01-01T00:00:00Z');

describe('analyzeClaims', () => {
  it('flags "alg":"none" as an error', () => {
    const findings = analyzeClaims({ alg: 'none' }, { exp: Math.floor(NOW.getTime() / 1000) + 3600 }, NOW);
    expect(findings.some((f) => f.code === 'alg-none' && f.severity === 'error')).toBe(true);
  });

  it('flags a missing exp claim', () => {
    const findings = analyzeClaims({ alg: 'HS256' }, {}, NOW);
    expect(findings.some((f) => f.code === 'missing-exp')).toBe(true);
  });

  it('flags an expired token', () => {
    const findings = analyzeClaims({ alg: 'HS256' }, { exp: Math.floor(NOW.getTime() / 1000) - 60 }, NOW);
    expect(findings.some((f) => f.code === 'expired' && f.severity === 'error')).toBe(true);
  });

  it('does not flag a token that expires in the future', () => {
    const findings = analyzeClaims({ alg: 'HS256' }, { exp: Math.floor(NOW.getTime() / 1000) + 3600, iat: Math.floor(NOW.getTime() / 1000), iss: 'x', sub: 'y', aud: 'z' }, NOW);
    expect(findings.some((f) => f.code === 'expired')).toBe(false);
  });

  it('flags nbf in the future as not-yet-valid', () => {
    const findings = analyzeClaims({ alg: 'HS256' }, { exp: Math.floor(NOW.getTime() / 1000) + 3600, nbf: Math.floor(NOW.getTime() / 1000) + 60 }, NOW);
    expect(findings.some((f) => f.code === 'not-yet-valid')).toBe(true);
  });

  it('flags a missing iat claim as info', () => {
    const findings = analyzeClaims({ alg: 'HS256' }, { exp: Math.floor(NOW.getTime() / 1000) + 3600 }, NOW);
    expect(findings.some((f) => f.code === 'missing-iat' && f.severity === 'info')).toBe(true);
  });

  it('flags iat in the future', () => {
    const findings = analyzeClaims({ alg: 'HS256' }, { exp: Math.floor(NOW.getTime() / 1000) + 3600, iat: Math.floor(NOW.getTime() / 1000) + 60 }, NOW);
    expect(findings.some((f) => f.code === 'iat-in-future')).toBe(true);
  });

  it('flags missing iss/sub/aud as info', () => {
    const findings = analyzeClaims({ alg: 'HS256' }, { exp: Math.floor(NOW.getTime() / 1000) + 3600, iat: Math.floor(NOW.getTime() / 1000) }, NOW);
    expect(findings.some((f) => f.code === 'missing-iss')).toBe(true);
    expect(findings.some((f) => f.code === 'missing-sub')).toBe(true);
    expect(findings.some((f) => f.code === 'missing-aud')).toBe(true);
  });

  it('flags an oversized token', () => {
    const payload = { exp: Math.floor(NOW.getTime() / 1000) + 3600, blob: 'x'.repeat(9000) };
    const findings = analyzeClaims({ alg: 'HS256' }, payload, NOW);
    expect(findings.some((f) => f.code === 'oversized')).toBe(true);
  });

  it('returns no findings for a well-formed, non-expired token', () => {
    const findings = analyzeClaims(
      { alg: 'RS256' },
      {
        exp: Math.floor(NOW.getTime() / 1000) + 3600,
        iat: Math.floor(NOW.getTime() / 1000),
        nbf: Math.floor(NOW.getTime() / 1000),
        iss: 'https://issuer.example',
        sub: 'user-1',
        aud: 'client-1',
      },
      NOW,
    );
    expect(findings).toHaveLength(0);
  });
});

describe('fuzzing (DUDE_PRD.md §21 Phase 23 Item 5)', () => {
  it('never throws for arbitrary JSON-shaped header/payload', () => {
    fc.assert(
      fc.property(fc.anything(), fc.anything(), (header, payload) => {
        expect(() => analyzeClaims(header, payload)).not.toThrow();
      }),
    );
  });
});
