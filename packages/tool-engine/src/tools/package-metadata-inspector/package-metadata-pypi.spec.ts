import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchPyPiMetadata } from "./package-metadata-pypi.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchPyPiMetadata', () => {
  it('normalizes a successful response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            info: { name: 'requests', version: '2.31.0', summary: 'Python HTTP for Humans.', license: 'Apache 2.0', requires_dist: ['charset-normalizer', 'idna'] },
          }),
      }),
    );

    const result = await fetchPyPiMetadata('requests');
    expect(result).toEqual({
      ok: true,
      metadata: { name: 'requests', latestVersion: '2.31.0', description: 'Python HTTP for Humans.', license: 'Apache 2.0', dependencyCount: 2 },
    });
  });

  it('treats a blank license/summary as absent', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ info: { name: 'pkg', version: '1.0.0', license: '', summary: '' } }) }));
    const result = await fetchPyPiMetadata('pkg');
    expect(result.ok && result.metadata.license).toBeNull();
    expect(result.ok && result.metadata.description).toBeNull();
  });

  it('reports a 404 as not found', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    const result = await fetchPyPiMetadata('does-not-exist-xyz');
    expect(result.ok).toBe(false);
  });
});
