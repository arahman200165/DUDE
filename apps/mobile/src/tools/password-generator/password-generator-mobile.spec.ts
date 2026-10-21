import { describe, expect, it } from 'vitest';
import { generateSecret, type GeneratorValues } from './password-generator-mobile';
import { installEngineHost } from '@dude/crypto/host';

// The engines draw randomness and SubtleCrypto from the host; Node provides the same WebCrypto surface the Android host adapts.
installEngineHost({ crypto: () => globalThis.crypto } as unknown as Parameters<typeof installEngineHost>[0]);

const values: GeneratorValues = {
  length: 16, useUppercase: false, useLowercase: false, useDigits: true, useSymbols: false, excludeAmbiguous: false,
  wordCount: 4, separator: '-', capitalize: false, includeDigit: false,
};

describe('generateSecret', () => {
  it('generates a password of the requested length from the selected classes with matching entropy', () => {
    const result = generateSecret('password', values);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatch(/^[0-9]{16}$/);
      expect(result.entropyBits).toBeCloseTo(16 * Math.log2(10), 5);
    }
  });
  it('reports an error when no character class is selected', () => {
    expect(generateSecret('password', { ...values, useDigits: false })).toEqual({ ok: false, error: 'Select at least one character type.' });
  });
  it('generates a separator-joined passphrase', () => {
    const result = generateSecret('passphrase', values);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.split('-')).toHaveLength(4);
  });
});
