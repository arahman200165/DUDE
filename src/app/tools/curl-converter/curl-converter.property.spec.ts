import fc from 'fast-check';
import { describe, it } from 'vitest';
import { neverThrows, roundTrip } from '../../../testing/property-harness';
import { parseCurl } from './curl-parse';
import { tokenizeShellCommand } from './curl-shell-lex';
import { buildCurlCommand } from '../../shared/http-request/curl-build';
import { ParsedHttpRequest } from '../../shared/http-request/http-request.model';

// A "safe" ASCII domain for the round-trip: excludes backslash/CR/LF (curl-shell-lex.ts's line-
// continuation stripping runs on the whole raw command before tokenizing, so a literal
// backslash-then-newline inside an otherwise-quoted value is a known, separately-tested edge
// case — see curl-shell-lex.spec.ts — rather than something this property should also chase).
const safeText = fc.string({ unit: 'grapheme-ascii' }).filter((s) => !/[\\\r\n]/.test(s));

const headerKey = safeText.filter((s) => !s.includes(':') && s.trim() !== '').map((s) => s.trim());
const headerValue = safeText.map((s) => s.trim());
const headerArb = fc.record({ key: headerKey, value: headerValue });

const multipartKey = safeText.filter((s) => !s.includes('=') && s.trim() !== '');
const multipartArb = fc.record({ key: multipartKey, value: safeText });

const authUsername = safeText.filter((s) => !s.includes(':'));
const authArb = fc.oneof(fc.constant(null), fc.record({ username: authUsername, password: safeText }));

const PATH_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_'.split('');
const segmentArb = fc.array(fc.constantFrom(...PATH_CHARS), { minLength: 1, maxLength: 8 }).map((chars) => chars.join(''));
const urlArb = fc
  .tuple(fc.constantFrom('example.com', 'api.example.com', 'sub.example.org'), fc.array(segmentArb, { maxLength: 3 }))
  .map(([domain, segments]) => `https://${domain}${segments.length === 0 ? '' : '/' + segments.join('/')}`);

const queryParamArb = fc.record({ key: safeText.filter((s) => s.trim() !== ''), value: safeText });

const bodyArb = fc.oneof(
  fc.constant({ kind: 'none' as const }),
  safeText.filter((s) => s !== '').map((text) => ({ kind: 'raw' as const, text, contentType: 'application/x-www-form-urlencoded' })),
  fc.array(multipartArb, { minLength: 1, maxLength: 3 }).map((fields) => ({ kind: 'multipart' as const, fields })),
);

const requestArb: fc.Arbitrary<ParsedHttpRequest> = fc.record({
  method: fc.constantFrom('GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'),
  url: urlArb,
  queryParams: fc.array(queryParamArb, { maxLength: 3 }),
  headers: fc.array(headerArb, { maxLength: 3 }),
  body: bodyArb,
  auth: authArb,
});

describe('buildCurlCommand / parseCurl round-trip', () => {
  it('recovers a structurally-safe ParsedHttpRequest after building and reparsing a curl command', () => {
    roundTrip(buildCurlCommand, (raw) => parseCurl(raw as string).request, requestArb);
  });
});

describe('curl-converter fuzzing', () => {
  it('parseCurl never throws for arbitrary text', () => {
    neverThrows((raw: string) => parseCurl(raw), fc.string(), {
      assertShape: (result) => {
        const r = result as { request: unknown; error: string | null; warnings: readonly string[] };
        if (!Array.isArray(r.warnings)) throw new Error('expected warnings to be an array');
      },
    });
  });

  it('tokenizeShellCommand never throws for arbitrary text', () => {
    neverThrows((raw: string) => tokenizeShellCommand(raw), fc.string(), {
      assertShape: (result) => {
        if (!Array.isArray(result)) throw new Error('expected an array of tokens');
      },
    });
  });
});
