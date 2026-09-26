import fc from 'fast-check';
import { describe, it } from 'vitest';
import { neverThrows, roundTrip } from '../../../testing/property-harness';
import { parseHttpRequestText } from './http-request-parse';
import { generateRawHttp } from '../../shared/http-request/export/curl-export-http';
import { ParsedHttpRequest } from '../../shared/http-request/http-request.model';

/**
 * generateRawHttp synthesizes a Host header (from the URL) and a Content-Length header (from
 * the body) when they're not already present, and always drops `auth` into a synthesized
 * Authorization header rather than round-tripping the `auth` field itself. So this round-trip
 * domain sticks to https, no body, no auth, and no user-supplied Host/Content-Length/Authorization
 * headers — the part of the format that genuinely round-trips field-for-field.
 */
const safeText = fc.string({ unit: 'grapheme-ascii' }).filter((s) => !/[\r\n]/.test(s));
const headerKey = safeText.filter((s) => !s.includes(':')).map((s) => s.trim());
const headerValue = safeText.map((s) => s.trim());
const RESERVED_HEADER_NAMES = new Set(['host', 'content-length', 'authorization']);
const headerArb = fc
  .record({ key: headerKey, value: headerValue })
  .filter((pair) => !RESERVED_HEADER_NAMES.has(pair.key.toLowerCase()));

const PATH_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_'.split('');
const segmentArb = fc.array(fc.constantFrom(...PATH_CHARS), { minLength: 1, maxLength: 8 }).map((chars) => chars.join(''));
const urlArb = fc
  .tuple(fc.constantFrom('example.com', 'api.example.com', 'sub.example.org'), fc.array(segmentArb, { minLength: 1, maxLength: 3 }))
  .map(([domain, segments]) => `https://${domain}/${segments.join('/')}`);

const queryParamArb = fc.record({ key: safeText.filter((s) => s.trim() !== ''), value: safeText });

const requestArb: fc.Arbitrary<ParsedHttpRequest> = fc.record({
  method: fc.constantFrom('GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'),
  url: urlArb,
  queryParams: fc.array(queryParamArb, { maxLength: 3 }),
  headers: fc.array(headerArb, { maxLength: 3 }),
  body: fc.constant({ kind: 'none' as const }),
  auth: fc.constant(null),
});

describe('generateRawHttp / parseHttpRequestText round-trip', () => {
  it('recovers method/url/queryParams/headers for a bodyless, auth-less https request', () => {
    roundTrip(
      (req: ParsedHttpRequest) => generateRawHttp(req),
      (raw) => parseHttpRequestText(raw as string, 'https').request,
      requestArb,
    );
  });
});

describe('parseHttpRequestText fuzzing', () => {
  it('never throws for arbitrary text', () => {
    neverThrows((raw: string) => parseHttpRequestText(raw), fc.string());
  });
});
