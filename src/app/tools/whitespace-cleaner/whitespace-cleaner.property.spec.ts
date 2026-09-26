import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { invariant, neverThrows } from '../../../testing/property-harness';
import { IndentStyle, LineEnding, TabConversion, WhitespaceCleanOptions, cleanWhitespace, migrateWhitespaceOptions } from './whitespace-clean';

const optionsArb: fc.Arbitrary<WhitespaceCleanOptions> = fc.record({
  trim: fc.boolean(),
  collapseSpaces: fc.boolean(),
  lineEnding: fc.constantFrom<LineEnding>('unchanged', 'lf', 'crlf', 'cr'),
  stripTrailingWhitespace: fc.boolean(),
  removeBlankLines: fc.boolean(),
  stripInvisibleChars: fc.boolean(),
  tabConversion: fc.constantFrom<TabConversion>('none', 'tabs-to-spaces', 'spaces-to-tabs'),
  tabWidth: fc.integer({ min: 1, max: 8 }),
  reindent: fc.boolean(),
  reindentFromWidth: fc.integer({ min: 1, max: 8 }),
  reindentToWidth: fc.integer({ min: 1, max: 8 }),
  reindentToStyle: fc.constantFrom<IndentStyle>('spaces', 'tabs'),
});

describe('cleanWhitespace fuzzing', () => {
  it('never throws and always returns a string, across the full option space', () => {
    neverThrows(([input, options]: [string, WhitespaceCleanOptions]) => cleanWhitespace(input, options), fc.tuple(fc.string(), optionsArb), {
      assertShape: (result) => expect(typeof result).toBe('string'),
    });
  });

  // `reindent` is a one-time width/style conversion (it assumes its input is indented in
  // `reindentFromWidth`-space units); applying it again to its own output -- now indented in
  // `reindentToWidth`/`reindentToStyle` units -- is expected to reshape indentation further, not
  // no-op. Idempotence is only a meaningful property with reindent off.
  const idempotentOptionsArb = optionsArb.map((options) => ({ ...options, reindent: false }));

  it('is idempotent (with reindent off): cleaning already-cleaned text with the same options is a no-op', () => {
    invariant(
      ([input, options]: [string, WhitespaceCleanOptions]) => {
        const once = cleanWhitespace(input, options);
        const twice = cleanWhitespace(once, options);
        return { once, twice };
      },
      fc.tuple(fc.string(), idempotentOptionsArb),
      ({ once, twice }) => once === twice,
    );
  });

  it('never introduces a line ending other than the requested one', () => {
    invariant(
      ([input, options]: [string, WhitespaceCleanOptions]) => cleanWhitespace(input, { ...options, lineEnding: 'lf' }),
      fc.tuple(fc.string(), optionsArb),
      (output) => !output.includes('\r'),
    );
  });
});

describe('migrateWhitespaceOptions fuzzing', () => {
  it('never throws for arbitrary stored values, and always fills in every option field', () => {
    neverThrows(
      (stored: unknown) => migrateWhitespaceOptions(stored),
      fc.anything(),
      {
        assertShape: (result) => {
          const options = result as WhitespaceCleanOptions;
          expect(typeof options.lineEnding).toBe('string');
          expect(typeof options.tabWidth).toBe('number');
        },
      },
    );
  });
});
