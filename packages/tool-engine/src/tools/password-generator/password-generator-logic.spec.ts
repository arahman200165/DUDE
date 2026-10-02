import { describe, expect, it } from 'vitest';
import { EFF_WORDLIST } from "./eff-wordlist.js";
import { buildPasswordCharset, generatePassphrase, generatePassword, passphraseEntropyBits } from "./password-generator-logic.js";

describe('eff-wordlist', () => {
  it('has no duplicate entries', () => {
    expect(new Set(EFF_WORDLIST).size).toBe(EFF_WORDLIST.length);
  });

  it('is the full EFF long wordlist (7,776 entries, one per 5-dice roll)', () => {
    expect(EFF_WORDLIST.length).toBe(7776);
  });

  it('contains only lowercase alphabetic words, with a few hyphenated entries', () => {
    for (const word of EFF_WORDLIST) {
      expect(word).toMatch(/^[a-z]+(-[a-z]+)*$/);
    }
  });
});

describe('buildPasswordCharset', () => {
  it('combines only the selected character classes', () => {
    const charset = buildPasswordCharset({
      length: 1,
      useUppercase: true,
      useLowercase: false,
      useDigits: true,
      useSymbols: false,
      excludeAmbiguous: false,
    });
    expect(charset).toMatch(/^[A-Z0-9]+$/);
  });

  it('excludes ambiguous characters when requested', () => {
    const charset = buildPasswordCharset({
      length: 1,
      useUppercase: true,
      useLowercase: true,
      useDigits: true,
      useSymbols: false,
      excludeAmbiguous: true,
    });
    expect(charset).not.toMatch(/[0Ol1I]/);
  });
});

describe('generatePassword', () => {
  it('produces a string of the requested length', () => {
    const password = generatePassword({
      length: 24,
      useUppercase: true,
      useLowercase: true,
      useDigits: true,
      useSymbols: true,
      excludeAmbiguous: false,
    });
    expect(password).toHaveLength(24);
  });

  it('only uses characters from the selected charset', () => {
    const password = generatePassword({
      length: 200,
      useUppercase: false,
      useLowercase: true,
      useDigits: true,
      useSymbols: false,
      excludeAmbiguous: false,
    });
    expect(password).toMatch(/^[a-z0-9]+$/);
  });

  it('throws when no character class is selected', () => {
    expect(() =>
      generatePassword({
        length: 10,
        useUppercase: false,
        useLowercase: false,
        useDigits: false,
        useSymbols: false,
        excludeAmbiguous: false,
      }),
    ).toThrow();
  });

  it('does not repeat the exact same value across many runs (sanity, not a strict distribution test)', () => {
    const results = new Set(
      Array.from({ length: 20 }, () =>
        generatePassword({
          length: 16,
          useUppercase: true,
          useLowercase: true,
          useDigits: true,
          useSymbols: true,
          excludeAmbiguous: false,
        }),
      ),
    );
    expect(results.size).toBe(20);
  });
});

describe('generatePassphrase', () => {
  // DUDE_PRD.md §21 Phase 23 Item 11 (deterministic test fixtures) -- these previously used '-'
  // as both the join separator and the split-back-apart delimiter, but the EFF wordlist contains
  // some hyphenated entries (e.g. "eyes-only"), so an unlucky random word could split into more
  // parts than wordCount and flake. '|' cannot appear inside any wordlist entry, so it's an
  // unambiguous delimiter regardless of which words are randomly chosen.
  it('produces the requested number of words joined by the separator', () => {
    const passphrase = generatePassphrase({ wordCount: 5, separator: '|', capitalize: false, includeDigit: false });
    expect(passphrase.split('|')).toHaveLength(5);
  });

  it('appends a trailing digit when requested', () => {
    const passphrase = generatePassphrase({ wordCount: 4, separator: '|', capitalize: false, includeDigit: true });
    const parts = passphrase.split('|');
    expect(parts).toHaveLength(5);
    expect(parts.at(-1)).toMatch(/^[0-9]$/);
  });

  it('capitalizes each word when requested', () => {
    const passphrase = generatePassphrase({ wordCount: 3, separator: '|', capitalize: true, includeDigit: false });
    for (const word of passphrase.split('|')) {
      expect(word[0]).toBe(word[0].toUpperCase());
    }
  });
});

describe('passphraseEntropyBits', () => {
  it('scales linearly with word count', () => {
    const perWord = passphraseEntropyBits(1, 1024);
    expect(passphraseEntropyBits(6, 1024)).toBeCloseTo(perWord * 6, 5);
  });
});
