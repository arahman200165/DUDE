import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { neverThrows } from '../../../testing/property-harness';
import { detectLockfileFormat, parseLockfile } from './lockfile-inspector-parse';

describe('lockfile parser properties', () => {
  it('never throws on arbitrary filename and content', () => {
    neverThrows(([name, content]) => parseLockfile(name, content), fc.tuple(fc.string(), fc.string()), { assertShape: (result) => expect(result).toHaveProperty('ok') });
  });
  it('recognizes formats from their canonical filenames', () => {
    fc.assert(fc.property(fc.constantFrom('package-lock.json', 'pnpm-lock.yaml', 'yarn.lock'), (name) => {
      const format = detectLockfileFormat(name, '');
      expect(['npm', 'pnpm', 'yarn-classic']).toContain(format);
    }));
  });
});
