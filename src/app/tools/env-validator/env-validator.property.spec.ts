import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { neverThrows } from '../../../testing/property-harness';
import { parseEnvRules, validateEnv } from './env-validator-logic';

describe('.env validator properties', () => {
  it('parses arbitrary rule text and validates arbitrary env text without throwing', () => {
    neverThrows(([env, rules]) => validateEnv(env, rules), fc.tuple(fc.string(), fc.string()), {
      assertShape: (result) => expect(Array.isArray(result)).toBe(true),
    });
    neverThrows(parseEnvRules, fc.string(), { assertShape: (result) => expect(Array.isArray(result)).toBe(true) });
  });
});
