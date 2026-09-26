import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { invariant, neverThrows } from '../../../testing/property-harness';
import { formatK8sManifest, parseK8sManifest, validateK8sManifest } from './k8s-manifest-validator-logic';

describe('k8s-manifest-validator properties', () => {
  it('never throws for arbitrary YAML input', () => {
    neverThrows(validateK8sManifest, fc.string(), { assertShape: (result) => expect(result).toHaveProperty('ok') });
    neverThrows(formatK8sManifest, fc.string(), { assertShape: (result) => expect(result).toHaveProperty('ok') });
  });
});
