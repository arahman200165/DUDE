import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { invariant, neverThrows } from '../../../testing/property-harness';
import { buildOgTags, hostnameFor } from './opengraph-logic';

describe('Open Graph preview properties', () => {
  it('builds tags without throwing for arbitrary settings', () => {
    const settings = fc.record({ title: fc.string(), description: fc.string(), image: fc.string(), url: fc.string(), siteName: fc.string(), type: fc.string() });
    neverThrows(buildOgTags, settings, { assertShape: (result) => expect(typeof result).toBe('string') });
  });
  it('returns a hostname for valid generated URLs and never throws otherwise', () => {
    invariant(hostnameFor, fc.webUrl(), (host, url) => host === new URL(url).hostname);
    neverThrows(hostnameFor, fc.string(), { assertShape: (result) => expect(typeof result).toBe('string') });
  });
});

