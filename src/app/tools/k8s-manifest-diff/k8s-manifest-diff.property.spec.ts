import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { neverThrows } from '../../../testing/property-harness';
import { diffK8sManifests } from './k8s-manifest-diff-logic';

describe('k8s-manifest-diff properties', () => {
  it('never throws for arbitrary manifest pairs', () => {
    neverThrows(({ before, after }) => diffK8sManifests(before, after), fc.record({ before: fc.string(), after: fc.string() }), { assertShape: (result) => expect(result).toHaveProperty('ok') });
  });
});
