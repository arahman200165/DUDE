import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchNuGetMetadata } from "./package-metadata-nuget.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: () => Promise.resolve(body) };
}

describe('fetchNuGetMetadata', () => {
  it('reads the latest version from the last inline catalog page', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          items: [
            {
              '@id': 'https://api.nuget.org/.../page1',
              items: [
                { catalogEntry: { version: '1.0.0', description: 'old', licenseExpression: 'MIT' } },
                { catalogEntry: { version: '2.0.0', description: 'Newtonsoft.Json — JSON for .NET', licenseExpression: 'MIT' } },
              ],
            },
          ],
        }),
      ),
    );

    const result = await fetchNuGetMetadata('Newtonsoft.Json');
    expect(result).toEqual({
      ok: true,
      metadata: { name: 'Newtonsoft.Json', latestVersion: '2.0.0', description: 'Newtonsoft.Json — JSON for .NET', license: 'MIT', dependencyCount: null },
    });
  });

  it('follows a page reference when the last page has no inline items', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ items: [{ '@id': 'https://api.nuget.org/.../page2' }] }))
      .mockResolvedValueOnce(jsonResponse({ items: [{ catalogEntry: { version: '3.0.0', description: 'desc' } }] }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchNuGetMetadata('SomePackage');
    expect(result.ok && result.metadata.latestVersion).toBe('3.0.0');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reports a 404 as not found', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(null, false, 404)));
    const result = await fetchNuGetMetadata('does-not-exist-xyz');
    expect(result.ok).toBe(false);
  });
});
