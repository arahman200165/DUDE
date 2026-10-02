import { describe, expect, it } from 'vitest';
import { buildBearerHeader } from "./bearer-token-builder-logic.js";

describe('buildBearerHeader', () => {
  it('matches RFC 6750 Section 2.1 Authorization example', () => {
    expect(buildBearerHeader('mF_9.B5f-4.1JqM')).toEqual({
      ok: true,
      value: { header: 'Bearer mF_9.B5f-4.1JqM', warnings: [] },
    });
  });

  it('wraps a token in a Bearer header', () => {
    const result = buildBearerHeader('abc123.def456');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.header).toBe('Bearer abc123.def456');
    expect(result.value.warnings).toHaveLength(0);
  });

  it('rejects empty input', () => {
    expect(buildBearerHeader('').ok).toBe(false);
    expect(buildBearerHeader('   ').ok).toBe(false);
  });

  it('trims an accidentally double-pasted "Bearer " prefix', () => {
    const result = buildBearerHeader('Bearer abc123');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.header).toBe('Bearer abc123');
  });

  it('rejects a "Bearer " prefix with nothing after it', () => {
    expect(buildBearerHeader('Bearer ').ok).toBe(false);
  });

  it('warns when the token contains characters outside the b64token charset', () => {
    const result = buildBearerHeader('token with spaces');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.warnings.length).toBeGreaterThan(0);
  });

  it('does not warn for a valid JWT-shaped token', () => {
    const result = buildBearerHeader('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dGhpcyBpcyBub3QgYSByZWFsIHNpZw');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.warnings).toHaveLength(0);
  });
});
