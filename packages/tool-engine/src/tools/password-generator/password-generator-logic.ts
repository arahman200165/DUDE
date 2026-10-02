import { hostCrypto } from "@dude/crypto/host";
import { EFF_WORDLIST } from "./eff-wordlist.js";

/**
 * Returns a cryptographically-secure random integer in [0, exclusiveMax) via
 * rejection sampling over `crypto.getRandomValues`, so every index has
 * exactly equal probability — a naive `randomByte % exclusiveMax` skews the
 * distribution whenever exclusiveMax doesn't evenly divide 256 (or the
 * chosen word range), which is the common case here.
 */
function secureRandomInt(exclusiveMax: number): number {
  if (exclusiveMax <= 0) throw new Error('exclusiveMax must be positive');
  if (exclusiveMax <= 256) {
    const limit = Math.floor(256 / exclusiveMax) * exclusiveMax;
    const bytes = new Uint8Array(1);
    let value: number;
    do {
      hostCrypto().getRandomValues(bytes);
      value = bytes[0];
    } while (value >= limit);
    return value % exclusiveMax;
  }

  // Wider range (e.g. indexing into the wordlist): draw from a 32-bit space.
  const range = 0x100000000;
  const limit = Math.floor(range / exclusiveMax) * exclusiveMax;
  const words = new Uint32Array(1);
  let value: number;
  do {
    hostCrypto().getRandomValues(words);
    value = words[0];
  } while (value >= limit);
  return value % exclusiveMax;
}

function pickRandom<T>(pool: readonly T[]): T {
  return pool[secureRandomInt(pool.length)];
}

const AMBIGUOUS_CHARS = new Set(['0', 'O', 'o', 'l', '1', 'I']);

const UPPERCASE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const LOWERCASE = 'abcdefghijklmnopqrstuvwxyz';
const DIGITS = '0123456789';
const SYMBOLS = '!@#$%^&*()-_=+[]{};:,.<>?';

export interface PasswordOptions {
  readonly length: number;
  readonly useUppercase: boolean;
  readonly useLowercase: boolean;
  readonly useDigits: boolean;
  readonly useSymbols: boolean;
  readonly excludeAmbiguous: boolean;
}

export function buildPasswordCharset(opts: PasswordOptions): string {
  let charset = '';
  if (opts.useUppercase) charset += UPPERCASE;
  if (opts.useLowercase) charset += LOWERCASE;
  if (opts.useDigits) charset += DIGITS;
  if (opts.useSymbols) charset += SYMBOLS;
  if (opts.excludeAmbiguous) {
    charset = Array.from(charset)
      .filter((char) => !AMBIGUOUS_CHARS.has(char))
      .join('');
  }
  return charset;
}

export function generatePassword(opts: PasswordOptions): string {
  const charset = buildPasswordCharset(opts);
  if (charset.length === 0) throw new Error('Select at least one character type.');
  if (opts.length < 1) throw new Error('Length must be at least 1.');

  return Array.from({ length: opts.length }, () => pickRandom(Array.from(charset))).join('');
}

export interface PassphraseOptions {
  readonly wordCount: number;
  readonly separator: string;
  readonly capitalize: boolean;
  readonly includeDigit: boolean;
}

export function generatePassphrase(opts: PassphraseOptions): string {
  if (opts.wordCount < 1) throw new Error('Word count must be at least 1.');

  const words = Array.from({ length: opts.wordCount }, () => {
    const word = pickRandom(EFF_WORDLIST);
    return opts.capitalize ? word[0].toUpperCase() + word.slice(1) : word;
  });

  if (opts.includeDigit) {
    words.push(String(secureRandomInt(10)));
  }

  return words.join(opts.separator);
}

/** Bits of entropy for a passphrase built from `wordCount` words drawn uniformly from `wordlistSize` candidates. */
export function passphraseEntropyBits(wordCount: number, wordlistSize: number = EFF_WORDLIST.length): number {
  return wordCount * Math.log2(wordlistSize);
}
