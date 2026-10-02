import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { invariant, neverThrows } from "../../../../../../tests/property-harness";
import { SlugOptions, SlugSeparator, generateSlug } from "@dude/tool-engine/tools/slug-generator/slug-generate";

const separatorArb = fc.constantFrom<SlugSeparator>('-', '_');
const optionsArb: fc.Arbitrary<SlugOptions> = fc.record({
  separator: separatorArb,
  maxLength: fc.option(fc.integer({ min: 1, max: 100 }), { nil: null }),
  removeStopwords: fc.boolean(),
});

describe('generateSlug fuzzing', () => {
  it('never throws and always returns a string, for arbitrary text and options', () => {
    neverThrows(([input, options]: [string, SlugOptions]) => generateSlug(input, options), fc.tuple(fc.string(), optionsArb), {
      assertShape: (result) => expect(typeof result).toBe('string'),
    });
  });
});

describe('generateSlug output format', () => {
  it('produces only lowercase alphanumerics separated by single, non-leading/trailing separators', () => {
    invariant(
      ([input, options]: [string, SlugOptions]) => generateSlug(input, options),
      fc.tuple(fc.string(), optionsArb),
      (slug, [, options]) => {
        const sep = options.separator === '-' ? '\\-' : '_';
        return new RegExp(`^([a-z0-9]+(${sep}[a-z0-9]+)*)?$`).test(slug);
      },
    );
  });

  it('never exceeds the requested maxLength', () => {
    invariant(
      ([input, options]: [string, SlugOptions]) => generateSlug(input, options),
      fc.tuple(fc.string(), optionsArb),
      (slug, [, options]) => (options.maxLength ? slug.length <= options.maxLength : true),
    );
  });
});

describe('generateSlug determinism', () => {
  it('is deterministic for the same input and options', () => {
    invariant(
      ([input, options]: [string, SlugOptions]) => [generateSlug(input, options), generateSlug(input, options)] as const,
      fc.tuple(fc.string(), optionsArb),
      ([first, second]) => first === second,
    );
  });
});
