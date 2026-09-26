import fc from 'fast-check';
import { describe, it } from 'vitest';
import { invariant, neverThrows } from '../../../testing/property-harness';
import { NormalizeOptions, compareUrls, normalizeUrl, resolveUrl } from './url-normalize';

const optionsArb: fc.Arbitrary<NormalizeOptions> = fc.record({
  sortQueryParams: fc.boolean(),
  stripTrailingSlash: fc.boolean(),
  stripFragment: fc.boolean(),
});

describe('url-normalize fuzzing', () => {
  it('normalizeUrl never throws for arbitrary text and options', () => {
    neverThrows(
      (input: { raw: string; options: NormalizeOptions }) => normalizeUrl(input.raw, input.options),
      fc.record({ raw: fc.string(), options: optionsArb }),
      {
        assertShape: (result) => {
          if (typeof (result as { ok: boolean }).ok !== 'boolean') throw new Error('expected a NormalizeResult');
        },
      },
    );
  });

  it('resolveUrl never throws for arbitrary base/relative text', () => {
    neverThrows(
      (input: { base: string; relative: string }) => resolveUrl(input.base, input.relative),
      fc.record({ base: fc.string(), relative: fc.string() }),
      {
        assertShape: (result) => {
          if (typeof (result as { ok: boolean }).ok !== 'boolean') throw new Error('expected a ResolveResult');
        },
      },
    );
  });

  it('compareUrls never throws for arbitrary pairs of text', () => {
    neverThrows(
      (input: { a: string; b: string }) => compareUrls(input.a, input.b),
      fc.record({ a: fc.string(), b: fc.string() }),
      {
        assertShape: (result) => {
          if (typeof (result as { ok: boolean }).ok !== 'boolean') throw new Error('expected a CompareResult');
        },
      },
    );
  });

  it('normalizeUrl is idempotent: re-normalizing an already-normalized URL never changes it', () => {
    invariant(
      (input: { raw: string; options: NormalizeOptions }) => {
        const first = normalizeUrl(input.raw, input.options);
        if (!first.ok) return { ok: false as const };
        const second = normalizeUrl(first.normalized, input.options);
        return { ok: true as const, first, second };
      },
      fc.record({ raw: fc.webUrl(), options: optionsArb }),
      (result) => {
        if (!result.ok) return true;
        return result.second.ok && result.second.normalized === result.first.normalized && result.second.changed === false;
      },
    );
  });
});
