/**
 * Pure, framework-free TOML validate/format used by the TOML Formatter /
 * Validator tool. Shared as-is between the main thread (small inputs) and
 * `toml-format.worker.ts` (large inputs).
 */

import { parse, stringify, TomlError } from 'smol-toml';

export type TomlMode = 'format' | 'validate';

export interface TomlFormatError {
  readonly message: string;
}

export type TomlFormatResult = { readonly ok: true; readonly output: string } | { readonly ok: false; readonly error: TomlFormatError };

export function processToml(input: string, mode: TomlMode): TomlFormatResult {
  if (input.trim() === '') return { ok: false, error: { message: 'Enter some TOML.' } };

  try {
    const parsed = parse(input);
    if (mode === 'validate') return { ok: true, output: input };
    return { ok: true, output: stringify(parsed) };
  } catch (error) {
    if (error instanceof TomlError) return { ok: false, error: { message: error.message } };
    return { ok: false, error: { message: error instanceof Error ? error.message : String(error) } };
  }
}
