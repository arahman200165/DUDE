import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { inspectToken } from './oauth-token-inspector-logic';

function toBase64Url(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function makeJwt(payload: Record<string, unknown>): string {
  return `${toBase64Url({ alg: 'HS256', typ: 'JWT' })}.${toBase64Url(payload)}.signature`;
}

describe('inspectToken', () => {
  it('detects a 3-segment token as JWT-shaped and decodes it', () => {
    const token = makeJwt({ scope: 'openid profile' });
    const result = inspectToken(token);
    expect(result.kind).toBe('jwt');
    if (result.kind !== 'jwt') return;
    expect(result.decoded.ok).toBe(true);
    expect(result.scopes).toEqual(['openid', 'profile']);
  });

  it('extracts scopes from an array-shaped "scp" claim', () => {
    const token = makeJwt({ scp: ['read', 'write'] });
    const result = inspectToken(token);
    expect(result.kind).toBe('jwt');
    if (result.kind !== 'jwt') return;
    expect(result.scopes).toEqual(['read', 'write']);
  });

  it('reports an empty scope list when no scope claim is present', () => {
    const token = makeJwt({});
    const result = inspectToken(token);
    expect(result.kind).toBe('jwt');
    if (result.kind !== 'jwt') return;
    expect(result.scopes).toHaveLength(0);
  });

  it('reports a decode error for a malformed 3-segment token without guessing structure', () => {
    const result = inspectToken('not-base64.also-not-base64.sig');
    expect(result.kind).toBe('jwt');
    if (result.kind !== 'jwt') return;
    expect(result.decoded.ok).toBe(false);
  });

  it('treats a non-3-segment string as an opaque token', () => {
    const result = inspectToken('ya29.a0AfH6SMBx');
    expect(result.kind).toBe('opaque');
  });

  it('recognizes a UUID-shaped opaque token', () => {
    const result = inspectToken('550e8400-e29b-41d4-a716-446655440000');
    expect(result.kind).toBe('opaque');
    if (result.kind !== 'opaque') return;
    expect(result.looksLikeUuid).toBe(true);
  });

  it('recognizes a base64-shaped opaque token', () => {
    const result = inspectToken('QUJDREVGRw==');
    expect(result.kind).toBe('opaque');
    if (result.kind !== 'opaque') return;
    expect(result.looksLikeBase64).toBe(true);
  });
});

describe('fuzzing (DUDE_PRD.md §21 Phase 23 Item 5)', () => {
  it('never throws for arbitrary text input', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        expect(() => inspectToken(input)).not.toThrow();
      }),
    );
  });
});
