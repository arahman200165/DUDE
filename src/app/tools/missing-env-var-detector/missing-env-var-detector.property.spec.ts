import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { invariant, neverThrows } from '../../../testing/property-harness';
import { extractReferencedVars, findMissingEnvVars } from './missing-env-var-detector-logic';

describe('missing environment variable detection properties', () => {
  it('extracts sorted unique references without throwing', () => {
    invariant(extractReferencedVars, fc.string(), (result) => [...result].sort().join('\0') === result.join('\0') && new Set(result).size === result.length);
  });
  it('never throws when comparing arbitrary source and env text', () => {
    neverThrows(([source, env]) => findMissingEnvVars(source, env), fc.tuple(fc.string(), fc.string()), { assertShape: (result) => expect(result).toHaveProperty('referencedButNotDeclared') });
  });
});
