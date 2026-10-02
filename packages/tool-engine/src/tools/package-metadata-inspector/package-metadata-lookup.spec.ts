import { afterEach, describe, expect, it, vi } from 'vitest';
import { lookupPackage } from "./package-metadata-lookup.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('lookupPackage', () => {
  it('rejects a blank name without making a network request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await lookupPackage('npm', '   ');
    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('dispatches to the fetcher for the chosen ecosystem', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ info: { name: 'requests', version: '2.31.0' } }) }),
    );

    const result = await lookupPackage('pypi', 'requests');
    expect(result.ok).toBe(true);
    expect(result.ok && result.metadata.name).toBe('requests');
  });
});
