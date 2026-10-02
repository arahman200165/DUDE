import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchCratesIoMetadata } from "./package-metadata-crates.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchCratesIoMetadata', () => {
  it('normalizes a successful response, matching the license to the newest version', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            crate: { name: 'serde', description: 'A serialization framework', newest_version: '1.0.190' },
            versions: [
              { num: '1.0.190', license: 'MIT OR Apache-2.0' },
              { num: '1.0.189', license: 'MIT OR Apache-2.0' },
            ],
          }),
      }),
    );

    return fetchCratesIoMetadata('serde').then((result) => {
      expect(result).toEqual({
        ok: true,
        metadata: { name: 'serde', latestVersion: '1.0.190', description: 'A serialization framework', license: 'MIT OR Apache-2.0', dependencyCount: null },
      });
    });
  });

  it('reports a 404 as not found', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    const result = await fetchCratesIoMetadata('does-not-exist-xyz');
    expect(result.ok).toBe(false);
  });
});
