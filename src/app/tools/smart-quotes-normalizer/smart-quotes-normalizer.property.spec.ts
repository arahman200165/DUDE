import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { invariant, neverThrows } from '../../../testing/property-harness';
import { Direction, SmartQuotesOptions, normalizeSmartQuotes } from './smart-quotes-normalize';

const optionsArb: fc.Arbitrary<SmartQuotesOptions> = fc.record({
  direction: fc.constantFrom<Direction>('to-straight', 'to-curly'),
  quotes: fc.boolean(),
  dashes: fc.boolean(),
  ellipsis: fc.boolean(),
});

describe('normalizeSmartQuotes fuzzing', () => {
  it('never throws and always returns a string, for arbitrary text and options', () => {
    neverThrows(([text, options]: [string, SmartQuotesOptions]) => normalizeSmartQuotes(text, options), fc.tuple(fc.string(), optionsArb), {
      assertShape: (result) => expect(typeof result).toBe('string'),
    });
  });

  it('is idempotent: normalizing an already-normalized string is a no-op', () => {
    invariant(
      ([text, options]: [string, SmartQuotesOptions]) => {
        const once = normalizeSmartQuotes(text, options);
        const twice = normalizeSmartQuotes(once, options);
        return { once, twice };
      },
      fc.tuple(fc.string(), optionsArb),
      ({ once, twice }) => once === twice,
    );
  });
});
