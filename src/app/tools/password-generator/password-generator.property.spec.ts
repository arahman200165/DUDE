import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { neverThrows } from '../../../testing/property-harness';
import { EFF_WORDLIST } from './eff-wordlist';
import {
  PassphraseOptions,
  PasswordOptions,
  buildPasswordCharset,
  generatePassphrase,
  generatePassword,
  passphraseEntropyBits,
} from './password-generator-logic';

const AMBIGUOUS_CHARS = new Set(['0', 'O', 'o', 'l', '1', 'I']);
const UPPERCASE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const LOWERCASE = 'abcdefghijklmnopqrstuvwxyz';
const DIGITS = '0123456789';
const SYMBOLS = '!@#$%^&*()-_=+[]{};:,.<>?';

/**
 * CROSSCHECK: an independently-written reference charset builder (own copy of the four
 * character-class strings + ambiguous set, not an import of `password-generator-logic.ts`'s
 * constants) so a bug in the source's own charset composition doesn't hide from its test.
 */
function referenceCharset(opts: PasswordOptions): Set<string> {
  let charset = '';
  if (opts.useUppercase) charset += UPPERCASE;
  if (opts.useLowercase) charset += LOWERCASE;
  if (opts.useDigits) charset += DIGITS;
  if (opts.useSymbols) charset += SYMBOLS;
  const chars = opts.excludeAmbiguous ? Array.from(charset).filter((c) => !AMBIGUOUS_CHARS.has(c)) : Array.from(charset);
  return new Set(chars);
}

const flagsShape = {
  useUppercase: fc.boolean(),
  useLowercase: fc.boolean(),
  useDigits: fc.boolean(),
  useSymbols: fc.boolean(),
  excludeAmbiguous: fc.boolean(),
};
const charsetFlags = fc.record(flagsShape);

const passwordOptionsArb: fc.Arbitrary<PasswordOptions> = fc
  .record({ length: fc.integer({ min: 1, max: 128 }), ...flagsShape })
  .filter((opts) => opts.useUppercase || opts.useLowercase || opts.useDigits || opts.useSymbols);

describe('buildPasswordCharset (CROSSCHECK: independent reference charset composition)', () => {
  it('matches an independently-built reference charset for every flag combination', () => {
    fc.assert(
      fc.property(charsetFlags, (flags) => {
        const charset = new Set(Array.from(buildPasswordCharset({ length: 1, ...flags })));
        expect(charset).toEqual(referenceCharset({ length: 1, ...flags }));
      }),
    );
  });

  it('never contains an ambiguous character when excludeAmbiguous is set', () => {
    fc.assert(
      fc.property(charsetFlags, (flags) => {
        const charset = buildPasswordCharset({ length: 1, ...flags, excludeAmbiguous: true });
        for (const char of charset) expect(AMBIGUOUS_CHARS.has(char)).toBe(false);
      }),
    );
  });
});

describe('generatePassword (CROSSCHECK: output stays within the requested/reference charset)', () => {
  it('never throws for valid option combinations, and returns a string', () => {
    neverThrows((opts: PasswordOptions) => generatePassword(opts), passwordOptionsArb, {
      assertShape: (result) => expect(typeof result).toBe('string'),
    });
  });

  it('produces the requested length using only characters from the reference charset', () => {
    fc.assert(
      fc.property(passwordOptionsArb, (opts) => {
        const password = generatePassword(opts);
        const allowed = referenceCharset(opts);
        expect(password).toHaveLength(opts.length);
        for (const char of password) expect(allowed.has(char)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('throws when no character class is selected, for any length', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 128 }), (length) => {
        expect(() =>
          generatePassword({
            length,
            useUppercase: false,
            useLowercase: false,
            useDigits: false,
            useSymbols: false,
            excludeAmbiguous: false,
          }),
        ).toThrow();
      }),
    );
  });
});

const passphraseOptionsArb: fc.Arbitrary<PassphraseOptions> = fc.record({
  wordCount: fc.integer({ min: 1, max: 12 }),
  // '-' is deliberately excluded: the EFF wordlist has hyphenated entries (e.g. "eyes-only"), so
  // splitting the passphrase back apart on '-' can't unambiguously recover word boundaries (see
  // the same note in password-generator-logic.spec.ts). The other separators cannot appear inside
  // any wordlist entry.
  separator: fc.constantFrom('_', '.', ' ', '|'),
  capitalize: fc.boolean(),
  includeDigit: fc.boolean(),
});

describe('generatePassphrase (CROSSCHECK: words come from the reference EFF wordlist)', () => {
  const wordlistLower = new Set(EFF_WORDLIST);

  it('never throws, and every non-digit word (case-folded) is a member of the reference wordlist', () => {
    fc.assert(
      fc.property(passphraseOptionsArb, (opts) => {
        const passphrase = generatePassphrase(opts);
        const parts = opts.separator === '' ? [passphrase] : passphrase.split(opts.separator);
        const words = opts.includeDigit ? parts.slice(0, -1) : parts;
        expect(words).toHaveLength(opts.wordCount);
        for (const word of words) {
          expect(wordlistLower.has(opts.capitalize ? word[0].toLowerCase() + word.slice(1) : word)).toBe(true);
        }
        if (opts.includeDigit) expect(parts.at(-1)).toMatch(/^[0-9]$/);
      }),
      { numRuns: 100 },
    );
  });
});

describe('passphraseEntropyBits (CROSSCHECK: independent log-identity recomputation)', () => {
  it('matches an alternate computation route (natural-log-based, not log2-based) of the same entropy formula', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 10 }), fc.integer({ min: 2, max: 10_000 }), (wordCount, wordlistSize) => {
        const expected = (wordCount * Math.log(wordlistSize)) / Math.log(2);
        expect(passphraseEntropyBits(wordCount, wordlistSize)).toBeCloseTo(expected, 6);
      }),
    );
  });

  it('scales linearly with word count for a fixed wordlist size', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 20 }), fc.integer({ min: 2, max: 10_000 }), (wordCount, wordlistSize) => {
        const perWord = passphraseEntropyBits(1, wordlistSize);
        expect(passphraseEntropyBits(wordCount, wordlistSize)).toBeCloseTo(perWord * wordCount, 5);
      }),
    );
  });
});
