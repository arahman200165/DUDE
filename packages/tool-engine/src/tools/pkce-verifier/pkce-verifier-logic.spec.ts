import { describe, expect, it } from 'vitest';
import { verifyPkce } from "./pkce-verifier-logic.js";

describe('verifyPkce', () => {
  it('rejects an empty verifier', async () => {
    const result = await verifyPkce({ verifier: '', challenge: 'x', method: 'S256' });
    expect(result.ok).toBe(false);
  });

  it('rejects an empty challenge', async () => {
    const result = await verifyPkce({ verifier: 'x'.repeat(43), challenge: '', method: 'S256' });
    expect(result.ok).toBe(false);
  });

  it('matches RFC 7636 Appendix B\'s worked example', async () => {
    const result = await verifyPkce({
      verifier: 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',
      challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
      method: 'S256',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.matches).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it('reports a mismatch when the challenge does not match', async () => {
    const result = await verifyPkce({
      verifier: 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',
      challenge: 'not-the-right-challenge',
      method: 'S256',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.matches).toBe(false);
  });

  it('supports the "plain" method as an identity comparison', async () => {
    const result = await verifyPkce({ verifier: 'x'.repeat(43), challenge: 'x'.repeat(43), method: 'plain' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.matches).toBe(true);
  });

  it('warns when the verifier is outside the recommended length range', async () => {
    const result = await verifyPkce({ verifier: 'short', challenge: 'anything', method: 'plain' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings.some((w) => w.includes('43-128'))).toBe(true);
  });

  it('warns when the verifier contains characters outside the unreserved set', async () => {
    const result = await verifyPkce({ verifier: 'x'.repeat(42) + '!', challenge: 'anything', method: 'plain' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings.some((w) => w.includes('unreserved'))).toBe(true);
  });
});
