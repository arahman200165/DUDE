import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { parseDiscoveryDocument } from "./oidc-discovery-inspector-logic.js";

const COMPLETE_DOC = {
  issuer: 'https://issuer.example.com',
  authorization_endpoint: 'https://issuer.example.com/authorize',
  token_endpoint: 'https://issuer.example.com/token',
  userinfo_endpoint: 'https://issuer.example.com/userinfo',
  jwks_uri: 'https://issuer.example.com/.well-known/jwks.json',
  response_types_supported: ['code'],
  subject_types_supported: ['public'],
  id_token_signing_alg_values_supported: ['RS256'],
  scopes_supported: ['openid', 'profile'],
  claims_supported: ['sub', 'name'],
  code_challenge_methods_supported: ['S256'],
};

describe('parseDiscoveryDocument', () => {
  it('rejects empty input', () => {
    expect(parseDiscoveryDocument('').ok).toBe(false);
  });

  it('rejects invalid JSON', () => {
    expect(parseDiscoveryDocument('{not json').ok).toBe(false);
  });

  it('rejects a non-object JSON value', () => {
    expect(parseDiscoveryDocument('[1,2,3]').ok).toBe(false);
  });

  it('reports no findings for a complete, well-formed document', () => {
    const result = parseDiscoveryDocument(JSON.stringify(COMPLETE_DOC));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.findings).toHaveLength(0);
  });

  it('flags every missing required field as an error', () => {
    const result = parseDiscoveryDocument(JSON.stringify({}));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const errorCount = result.findings.filter((f) => f.severity === 'error').length;
    expect(errorCount).toBe(6);
  });

  it('flags a missing recommended field as a warning', () => {
    const { token_endpoint, ...rest } = COMPLETE_DOC;
    void token_endpoint;
    const result = parseDiscoveryDocument(JSON.stringify(rest));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.findings.some((f) => f.message.includes('token_endpoint') && f.severity === 'warning')).toBe(true);
  });

  it('flags a non-https issuer', () => {
    const result = parseDiscoveryDocument(JSON.stringify({ ...COMPLETE_DOC, issuer: 'http://issuer.example.com' }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.findings.some((f) => f.message.includes('https'))).toBe(true);
  });

  it('flags missing S256 in code_challenge_methods_supported', () => {
    const result = parseDiscoveryDocument(JSON.stringify({ ...COMPLETE_DOC, code_challenge_methods_supported: ['plain'] }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.findings.some((f) => f.message.includes('S256'))).toBe(true);
  });

  it('flags a missing code_challenge_methods_supported field as info', () => {
    const { code_challenge_methods_supported, ...rest } = COMPLETE_DOC;
    void code_challenge_methods_supported;
    const result = parseDiscoveryDocument(JSON.stringify(rest));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.findings.some((f) => f.severity === 'info' && f.message.includes('PKCE'))).toBe(true);
  });
});

describe('fuzzing (DUDE_PRD.md §21 Phase 23 Item 5)', () => {
  it('never throws for arbitrary text input', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        expect(() => parseDiscoveryDocument(input)).not.toThrow();
      }),
    );
  });

  it('never throws for an arbitrary JSON object', () => {
    fc.assert(
      fc.property(fc.dictionary(fc.string(), fc.anything()), (doc) => {
        expect(() => parseDiscoveryDocument(JSON.stringify(doc))).not.toThrow();
      }),
    );
  });
});
