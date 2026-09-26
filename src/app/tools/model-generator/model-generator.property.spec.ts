import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { neverThrows } from '../../../testing/property-harness';
import { generateModel, MODEL_LANGUAGES } from './model-generator-generate';

describe('model generator properties', () => {
  it('never throws on arbitrary JSON text and known languages', () => {
    neverThrows(([input, language]) => generateModel(input, 'Generated', language), fc.tuple(fc.string(), fc.constantFrom(...Object.keys(MODEL_LANGUAGES) as (keyof typeof MODEL_LANGUAGES)[])), { assertShape: (result) => expect(result).toHaveProperty('ok') });
  });
  it('produces source for arbitrary primitive JSON values in every language', () => {
    fc.assert(fc.property(fc.jsonValue(), fc.constantFrom(...Object.keys(MODEL_LANGUAGES) as (keyof typeof MODEL_LANGUAGES)[]), (value, language) => {
      const result = generateModel(JSON.stringify(value), 'Sample', language);
      expect(result.ok).toBe(true);
      if (result.ok) expect(typeof result.code).toBe('string');
    }));
  });
});
