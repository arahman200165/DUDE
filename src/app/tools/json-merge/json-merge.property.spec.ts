import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { neverThrows } from '../../../testing/property-harness';
import { mergeJson } from './json-merge-transform';

describe('JSON merge properties', () => {
  it('returns a result for arbitrary input pairs and strategies', () => {
    neverThrows(([a, b, strategy]: [string, string, 'deep' | 'rfc7396']) => mergeJson(a, b, strategy),
      fc.tuple(fc.string(), fc.string(), fc.constantFrom('deep' as const, 'rfc7396' as const)), {
        assertShape: (result) => expect(typeof result).toBe('object'),
      });
  });
});
