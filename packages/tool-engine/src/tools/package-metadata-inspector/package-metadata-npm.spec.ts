import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchNpmMetadata } from "./package-metadata-npm.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchNpmMetadata', () => {
  it('normalizes a successful response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            description: 'A modern JS utility library',
            license: 'MIT',
            'dist-tags': { latest: '4.17.21' },
            versions: { '4.17.21': { dependencies: { a: '^1.0.0', b: '^2.0.0' } } },
          }),
      }),
    );

    const result = await fetchNpmMetadata('lodash');
    expect(result).toEqual({
      ok: true,
      metadata: { name: 'lodash', latestVersion: '4.17.21', description: 'A modern JS utility library', license: 'MIT', dependencyCount: 2 },
    });
  });

  it('unwraps a license object shape', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ license: { type: 'Apache-2.0' }, 'dist-tags': { latest: '1.0.0' } }) }),
    );
    const result = await fetchNpmMetadata('pkg');
    expect(result.ok && result.metadata.license).toBe('Apache-2.0');
  });

  it('reports a 404 as not found', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    const result = await fetchNpmMetadata('does-not-exist-xyz');
    expect(result.ok).toBe(false);
  });

  it('reports a network failure without throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const result = await fetchNpmMetadata('lodash');
    expect(result.ok).toBe(false);
  });
});
