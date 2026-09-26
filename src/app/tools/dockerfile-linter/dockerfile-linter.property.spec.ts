import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { invariant, neverThrows } from '../../../testing/property-harness';
import { formatDockerfile, lintDockerfile, parseDockerfile } from './dockerfile-linter-logic';

describe('dockerfile-linter properties', () => {
  it('never throws and returns issue arrays for arbitrary text', () => {
    neverThrows(lintDockerfile, fc.string(), { assertShape: (result) => expect(Array.isArray(result)).toBe(true) });
  });
  it('formatting is idempotent', () => {
    invariant(formatDockerfile, fc.string(), (formatted) => formatDockerfile(formatted) === formatted);
  });
});
