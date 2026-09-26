import fc from 'fast-check';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { asyncNeverThrows } from '../../../testing/property-harness';
import { lookupPackage } from './package-metadata-lookup';
import { PackageEcosystem, PackageLookupResult } from './package-metadata-types';

afterEach(() => vi.unstubAllGlobals());

const ECOSYSTEMS: readonly PackageEcosystem[] = ['npm', 'pypi', 'crates', 'nuget'];
const malformedPayloadArb = fc.oneof(
  fc.jsonValue(),
  fc.constantFrom<unknown>(null, [], 'malformed registry response', 0, true, { info: null }, { versions: [null] }, { items: [null] }),
);
const packageNameArb = fc.stringMatching(/^[A-Za-z0-9._-]{1,24}$/);

function assertLookupShape(value: unknown): void {
  expect(value).toEqual(expect.objectContaining({ ok: expect.any(Boolean) }));
  const result = value as PackageLookupResult;
  if (!result.ok) {
    expect(result.error.length).toBeGreaterThan(0);
    return;
  }

  expect(typeof result.metadata.name).toBe('string');
  expect(typeof result.metadata.latestVersion).toBe('string');
  expect(result.metadata.description === null || typeof result.metadata.description === 'string').toBe(true);
  expect(result.metadata.license === null || typeof result.metadata.license === 'string').toBe(true);
  expect(result.metadata.dependencyCount === null || Number.isInteger(result.metadata.dependencyCount) && result.metadata.dependencyCount >= 0).toBe(true);
}

describe('package metadata registry adapter properties', () => {
  it('resolves a typed lookup result for generated names and malformed registry JSON without network access', async () => {
    for (const ecosystem of ECOSYSTEMS) {
      await asyncNeverThrows(
        async ([packageName, payload]: readonly [string, unknown]) => {
          vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(payload) }));
          return lookupPackage(ecosystem, packageName);
        },
        fc.tuple(packageNameArb, malformedPayloadArb),
        { numRuns: 200, assertShape: assertLookupShape },
      );
    }
  });

  it('trims package names before dispatch and handles empty names without fetching', async () => {
    await asyncNeverThrows(
      async (name: string) => {
        const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({}) });
        vi.stubGlobal('fetch', fetchMock);
        const result = await lookupPackage('npm', `  ${name}  `);
        expect(result.ok).toBe(true);
        expect(fetchMock.mock.calls[0]?.[0]).toBe(`https://registry.npmjs.org/${encodeURIComponent(name)}`);
        return result;
      },
      packageNameArb,
      { numRuns: 50, assertShape: assertLookupShape },
    );

    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(lookupPackage('npm', '   ')).resolves.toMatchObject({ ok: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
