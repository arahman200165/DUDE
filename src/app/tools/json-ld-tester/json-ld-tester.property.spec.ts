import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { neverThrows } from '../../../testing/property-harness';
import { validateJsonLd } from './json-ld-logic';

describe('JSON-LD validation properties', () => {
  it('never throws for arbitrary text and returns a result shape', () => {
    neverThrows(validateJsonLd, fc.string(), { assertShape: (result) => expect(result).toHaveProperty('ok') });
  });
  it('valid JSON arrays always produce a successful validation result', () => {
    fc.assert(fc.property(fc.jsonValue(), (value) => {
      const result = validateJsonLd(JSON.stringify([value]));
      expect(result.ok).toBe(true);
    }));
  });
});
