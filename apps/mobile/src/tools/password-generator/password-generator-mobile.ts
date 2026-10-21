import {
  buildPasswordCharset, generatePassphrase, generatePassword, passphraseEntropyBits,
} from '@dude/tool-engine/tools/password-generator/password-generator-logic';

export type GeneratorMode = 'password' | 'passphrase';
export interface GeneratorValues {
  readonly length: number;
  readonly useUppercase: boolean;
  readonly useLowercase: boolean;
  readonly useDigits: boolean;
  readonly useSymbols: boolean;
  readonly excludeAmbiguous: boolean;
  readonly wordCount: number;
  readonly separator: string;
  readonly capitalize: boolean;
  readonly includeDigit: boolean;
}
export type GeneratorOutcome =
  | { readonly ok: true; readonly value: string; readonly entropyBits: number }
  | { readonly ok: false; readonly error: string };

/** One generated secret and its entropy estimate. The value is returned to the caller only; nothing here stores it. */
export function generateSecret(mode: GeneratorMode, values: GeneratorValues): GeneratorOutcome {
  try {
    if (mode === 'password') {
      const options = {
        length: values.length, useUppercase: values.useUppercase, useLowercase: values.useLowercase,
        useDigits: values.useDigits, useSymbols: values.useSymbols, excludeAmbiguous: values.excludeAmbiguous,
      };
      const value = generatePassword(options);
      return { ok: true, value, entropyBits: values.length * Math.log2(buildPasswordCharset(options).length) };
    }
    const value = generatePassphrase({ wordCount: values.wordCount, separator: values.separator, capitalize: values.capitalize, includeDigit: values.includeDigit });
    return { ok: true, value, entropyBits: passphraseEntropyBits(values.wordCount) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not generate a value.' };
  }
}
