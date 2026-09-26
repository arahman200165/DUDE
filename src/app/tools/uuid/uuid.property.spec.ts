import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { invariant } from '../../../testing/property-harness';
import { generateUuid, inspectUuid, PREDEFINED_NAMESPACES } from './uuid-tool';

describe('UUID properties', () => {
  it('generates valid UUIDs with the selected version', () => {
    invariant(
      (version) => generateUuid(version, { namespace: PREDEFINED_NAMESPACES.DNS, name: 'property-test' }),
      fc.constantFrom<'v1' | 'v3' | 'v4' | 'v5' | 'v6' | 'v7'>('v1', 'v3', 'v4', 'v5', 'v6', 'v7'),
      (result, version) => result.ok && inspectUuid(result.value).valid && inspectUuid(result.value).version === Number(version.slice(1)),
    );
  });

  it('keeps namespace UUID generation deterministic for identical inputs', () => {
    fc.assert(fc.property(fc.string({ minLength: 1, maxLength: 40 }), (name) => {
      expect(generateUuid('v5', { namespace: PREDEFINED_NAMESPACES.URL, name })).toEqual(generateUuid('v5', { namespace: PREDEFINED_NAMESPACES.URL, name }));
    }));
  });
});
