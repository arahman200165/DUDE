import fc from 'fast-check';
import { describe, it } from 'vitest';
import { invariant, neverThrows, roundTrip } from '../../../testing/property-harness';
import { UrlParts, buildUrl, parseUrl } from './url-parts';
import { segmentUri } from './uri-component-visualizer';

// Character sets chosen so building then reparsing never triggers the WHATWG URL setters'
// own percent-encoding or dot-segment normalization (both real behaviors, exercised by the
// example-based specs — this property targets the part of the domain that round-trips exactly).
const PATH_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_~!$&'()*+,;=:@".split('');
const HASH_CHARS = [...PATH_CHARS, '/'];
const AUTH_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_~'.split('');

const segmentArb = (chars: readonly string[], maxLength: number) =>
  fc.array(fc.constantFrom(...chars), { maxLength }).map((cs) => cs.join(''));

// pathname always starts with '/' (an empty pathname is itself defaulted to '/' by the URL
// setter, so the round trip only targets pathnames already in that normalized form).
const pathnameArb = fc
  .array(segmentArb(PATH_CHARS, 6).filter((s) => s !== ''), { maxLength: 3 })
  .map((segments) => '/' + segments.join('/'));

const hashArb = segmentArb(HASH_CHARS, 8);

const authArb = fc.oneof(
  fc.constant({ username: '', password: '' }),
  fc.record({
    username: segmentArb(AUTH_CHARS, 5).filter((s) => s !== ''),
    password: segmentArb(AUTH_CHARS, 5).filter((s) => s !== ''),
  }),
);

const queryPairArb = fc.record({ key: fc.string({ minLength: 1 }), value: fc.string() });

type UrlPartsInput = Omit<UrlParts, 'origin'>;

const urlPartsInputArb: fc.Arbitrary<UrlPartsInput> = fc
  .record({
    auth: authArb,
    hostname: fc.constantFrom('example.com', 'api.example.com', 'sub.example.org'),
    port: fc.constantFrom('', '8080', '3000', '9443'),
    pathname: pathnameArb,
    queryParams: fc.array(queryPairArb, { maxLength: 3 }),
    hash: hashArb,
  })
  .map(({ auth, hostname, port, pathname, queryParams, hash }) => ({
    protocol: 'https',
    username: auth.username,
    password: auth.password,
    hostname,
    port,
    pathname,
    queryParams,
    hash,
  }));

describe('buildUrl / parseUrl round-trip', () => {
  it('recovers the original UrlParts (minus the derived origin) after building and reparsing', () => {
    roundTrip(
      (parts: UrlPartsInput) => {
        const built = buildUrl({ ...parts, origin: '' });
        if (!built.ok) throw new Error(`unexpected buildUrl failure: ${built.error}`);
        return built.url;
      },
      (url) => {
        const parsed = parseUrl(url as string);
        if (!parsed.ok) throw new Error(`unexpected parseUrl failure: ${parsed.error}`);
        const { origin: _origin, ...rest } = parsed.parts;
        return rest;
      },
      urlPartsInputArb,
    );
  });
});

describe('url-parts fuzzing', () => {
  it('parseUrl never throws for arbitrary text', () => {
    neverThrows((raw: string) => parseUrl(raw), fc.string(), {
      assertShape: (result) => {
        if (typeof (result as { ok: boolean }).ok !== 'boolean') throw new Error('expected a ParseUrlResult');
      },
    });
  });
});

describe('segmentUri fuzzing', () => {
  it('never throws, and concatenating every segment recovers the original string exactly', () => {
    invariant(
      segmentUri,
      fc.string(),
      (segments, raw) =>
        segments.map((s) => s.text).join('') === raw,
    );
  });
});
