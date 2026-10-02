/**
 * Pure, framework-free NanoID generation, built on the `nanoid` package
 * (its collision-resistant CSPRNG-backed alphabet math is easy to get subtly wrong by hand).
 */
import { customAlphabet, nanoid } from 'nanoid';

export const DEFAULT_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';

export type GenerateResult = { readonly ok: true; readonly values: readonly string[] } | { readonly ok: false; readonly error: string };

export function generateNanoIds(count: number, size: number, alphabet: string): GenerateResult {
  if (!Number.isInteger(count) || count < 1 || count > 1000) {
    return { ok: false, error: 'Count must be an integer between 1 and 1000.' };
  }
  if (!Number.isInteger(size) || size < 1 || size > 512) {
    return { ok: false, error: 'Length must be an integer between 1 and 512.' };
  }

  const trimmedAlphabet = alphabet.trim();
  if (trimmedAlphabet === '') {
    return { ok: true, values: Array.from({ length: count }, () => nanoid(size)) };
  }
  if (new Set(trimmedAlphabet).size < 2) {
    return { ok: false, error: 'A custom alphabet needs at least 2 distinct characters.' };
  }

  const generate = customAlphabet(trimmedAlphabet, size);
  return { ok: true, values: Array.from({ length: count }, () => generate()) };
}
