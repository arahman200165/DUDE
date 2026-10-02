import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { annotateKnownScopes, buildScopeString, parseScopeString } from "./oauth-scope-parser-logic.js";

describe('parseScopeString', () => {
  it('splits a space-delimited scope string', () => {
    const result = parseScopeString('openid profile email');
    expect(result.scopes).toEqual(['openid', 'profile', 'email']);
    expect(result.duplicates).toHaveLength(0);
  });

  it('handles empty input', () => {
    const result = parseScopeString('');
    expect(result.scopes).toHaveLength(0);
  });

  it('collapses repeated whitespace', () => {
    const result = parseScopeString('openid   profile\temail');
    expect(result.scopes).toEqual(['openid', 'profile', 'email']);
  });

  it('detects duplicate scopes', () => {
    const result = parseScopeString('openid profile openid');
    expect(result.scopes).toEqual(['openid', 'profile']);
    expect(result.duplicates).toEqual(['openid']);
  });

  it('normalizes to a sorted, space-joined string', () => {
    const result = parseScopeString('profile openid email');
    expect(result.normalized).toBe('email openid profile');
  });
});

describe('annotateKnownScopes', () => {
  it('annotates well-known OIDC scopes', () => {
    const [openid] = annotateKnownScopes(['openid']);
    expect(openid.known).toBe(true);
    expect(openid.description).toContain('ID token');
  });

  it('annotates a .default vendor scope', () => {
    const [scope] = annotateKnownScopes(['https://graph.microsoft.com/.default']);
    expect(scope.known).toBe(true);
  });

  it('annotates .read/.write vendor scopes', () => {
    const [scope] = annotateKnownScopes(['calendar.read']);
    expect(scope.known).toBe(true);
  });

  it('marks unfamiliar scopes as unknown', () => {
    const [scope] = annotateKnownScopes(['custom:internal-scope']);
    expect(scope.known).toBe(false);
    expect(scope.description).toBeUndefined();
  });
});

describe('buildScopeString', () => {
  it('joins non-empty scopes with a space', () => {
    expect(buildScopeString(['openid', 'profile'])).toBe('openid profile');
  });

  it('filters out blank entries', () => {
    expect(buildScopeString(['openid', '', 'profile'])).toBe('openid profile');
  });
});

describe('round-trip property (DUDE_PRD.md §21 Phase 23 Item 4)', () => {
  const nonBlankToken = fc.string().filter((s) => s.trim() !== '' && !/\s/.test(s));

  it('parseScopeString(buildScopeString(scopes)).scopes recovers the first-occurrence-deduped list', () => {
    fc.assert(
      fc.property(fc.array(nonBlankToken), (scopes) => {
        const deduped = [...new Set(scopes)];
        expect(parseScopeString(buildScopeString(scopes)).scopes).toEqual(deduped);
      }),
    );
  });

  it('never throws for arbitrary text input', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        expect(() => parseScopeString(input)).not.toThrow();
      }),
    );
  });
});
