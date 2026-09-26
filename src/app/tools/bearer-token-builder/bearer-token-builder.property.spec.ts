import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { neverThrows } from '../../../testing/property-harness';
import { buildBearerHeader } from './bearer-token-builder-logic';

/**
 * CROSSCHECK: an RFC 6750 §2.1 b64token grammar regex written independently from
 * `bearer-token-builder-logic.ts`'s own `B64TOKEN_PATTERN`, so a bug in that pattern
 * isn't invisible to its own test.
 *   b64token = 1*( ALPHA / DIGIT / "-" / "." / "_" / "~" / "+" / "/" ) *"="
 */
const RFC6750_B64TOKEN = /^[A-Za-z0-9\-._~+/]+=*$/;

const b64TokenChar = fc.constantFrom(
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~+/'.split(''),
);
const validB64Token = fc.array(b64TokenChar, { minLength: 1, maxLength: 40 }).map((chars) => chars.join(''));

describe('buildBearerHeader (CROSSCHECK: RFC 6750 §2.1 b64token grammar)', () => {
  it('never throws for arbitrary text input', () => {
    neverThrows((s: string) => buildBearerHeader(s), fc.string({ maxLength: 200 }));
  });

  it('wraps any grammar-valid b64token as "Bearer <token>" with no warnings', () => {
    fc.assert(
      fc.property(validB64Token, (token) => {
        expect(RFC6750_B64TOKEN.test(token)).toBe(true); // sanity: generator matches the spec grammar
        const result = buildBearerHeader(token);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value.header).toBe(`Bearer ${token}`);
        expect(result.value.warnings).toHaveLength(0);
      }),
    );
  });

  it('warns iff the (prefix-stripped, trimmed) token falls outside the RFC 6750 b64token grammar', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 60 }).filter((s) => s.trim() !== ''),
        (raw) => {
          const result = buildBearerHeader(raw);
          if (!result.ok) return; // empty-after-prefix-strip case, covered by the dedicated rejection test below
          const stripped = raw.replace(/^\s*Bearer\s+/i, '').trim();
          expect(result.value.warnings.length > 0).toBe(!RFC6750_B64TOKEN.test(stripped));
        },
      ),
    );
  });

  it('strips a doubled "Bearer " prefix regardless of the valid token that follows', () => {
    fc.assert(
      fc.property(validB64Token, (token) => {
        const result = buildBearerHeader(`Bearer ${token}`);
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.value.header).toBe(`Bearer ${token}`);
      }),
    );
  });

  it('rejects empty or whitespace-only input, including a "Bearer " prefix with nothing after it', () => {
    // Note: a bare "Bearer" with no trailing whitespace is NOT covered here — the prefix-strip
    // regex requires whitespace after "Bearer" to match, so "Bearer" alone is (correctly) treated
    // as the token itself, not stripped to empty.
    fc.assert(
      fc.property(fc.constantFrom('', '   ', '\t\n', 'Bearer ', 'Bearer   ', '  Bearer  '), (input) => {
        expect(buildBearerHeader(input).ok).toBe(false);
      }),
    );
  });
});
