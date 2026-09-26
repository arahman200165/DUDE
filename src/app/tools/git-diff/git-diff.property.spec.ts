import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { invariant } from '../../../testing/property-harness';
import { buildInMemoryFs } from './git-fs-shim';

describe('git-diff filesystem core properties', () => {
  it('constructs a read-only filesystem client for arbitrary file bytes', () => {
    invariant(
      (content: string) => buildInMemoryFs([{ path: '/repo/.git/HEAD', data: new TextEncoder().encode(content) }]),
      fc.string(),
      (fs) => typeof fs.promises.readFile === 'function' && typeof fs.promises.readdir === 'function' && typeof fs.promises.writeFile === 'function',
    );
  });
});
