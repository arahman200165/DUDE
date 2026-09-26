import fc from 'fast-check';
import { describe, it } from 'vitest';
import { neverThrows, roundTrip } from '../../../testing/property-harness';
import { parseUserAgent } from './ua-parse';

// ua-parser-js has no matching "build a UA string" function, so — mirroring
// http-response-viewer.property.spec.ts's convention — the round trip's encode side is a small
// test-local helper that plugs a version number into a real-world UA template, and the decode
// side reads the corresponding parsed field back out.
const versionArb = fc.array(fc.nat({ max: 9999 }), { minLength: 1, maxLength: 4 }).map((parts) => parts.join('.'));

function chromeUa(version: string): string {
  return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${version} Safari/537.36`;
}

function iosUa(version: string): string {
  const underscored = version.replace(/\./g, '_');
  return `Mozilla/5.0 (iPhone; CPU iPhone OS ${underscored} like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1`;
}

describe('parseUserAgent round-trip', () => {
  it('recovers the exact Chrome version embedded in a desktop UA template', () => {
    roundTrip(
      chromeUa,
      (ua) => {
        const result = parseUserAgent(ua as string);
        if (!result.ok || result.parsed.browser.version === undefined) throw new Error('unexpected parse failure');
        return result.parsed.browser.version;
      },
      versionArb,
    );
  });

  it('recovers the exact iOS version embedded in a mobile Safari UA template', () => {
    roundTrip(
      iosUa,
      (ua) => {
        const result = parseUserAgent(ua as string);
        if (!result.ok || result.parsed.os.version === undefined) throw new Error('unexpected parse failure');
        return result.parsed.os.version;
      },
      versionArb,
    );
  });
});

describe('parseUserAgent fuzzing', () => {
  it('never throws for arbitrary text', () => {
    neverThrows((raw: string) => parseUserAgent(raw), fc.string(), {
      assertShape: (result) => {
        if (typeof (result as { ok: boolean }).ok !== 'boolean') throw new Error('expected a UserAgentParseResult');
      },
    });
  });
});
