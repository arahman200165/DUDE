import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { neverThrows } from '../../../testing/property-harness';
import { sortJsonKeys } from './json-sort-keys-transform';

describe('JSON key sort properties', () => {
  it('never throws for arbitrary JSON text and sorting options', () => {
    neverThrows(([input, recursive, order]: [string, boolean, 'asc' | 'desc']) => sortJsonKeys(input, recursive, order),
      fc.tuple(fc.string(), fc.boolean(), fc.constantFrom('asc' as const, 'desc' as const)), {
        assertShape: (result) => expect(typeof result).toBe('object'),
      });
  });
});
