import { hostFetch } from "@dude/crypto/host";
import { PackageLookupResult } from "./package-metadata-types.js";

interface CatalogEntry {
  readonly description?: string;
  readonly licenseExpression?: string;
  readonly version?: string;
}

interface CatalogPageItem {
  readonly catalogEntry?: CatalogEntry;
}

interface CatalogPage {
  readonly '@id': string;
  readonly items?: readonly CatalogPageItem[];
}

interface RegistrationIndex {
  readonly items?: readonly CatalogPage[];
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await hostFetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

export async function fetchNuGetMetadata(packageId: string): Promise<PackageLookupResult> {
  const lowerId = packageId.toLowerCase();
  let index: RegistrationIndex;

  try {
    index = ((await fetchJson(`https://api.nuget.org/v3/registration5-semver1/${encodeURIComponent(lowerId)}/index.json`)) ?? {}) as RegistrationIndex;
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('404')) return { ok: false, error: `"${packageId}" was not found on NuGet.` };
    return { ok: false, error: 'Network request to api.nuget.org failed.' };
  }

  const lastPage = index.items?.[index.items.length - 1];
  if (!lastPage) return { ok: false, error: `"${packageId}" was not found on NuGet.` };

  // Packages with many versions split into multiple catalog pages; a page without inline `items`
  // only carries an `@id` to a further page — fetch that one page rather than the whole history.
  const pageItems = lastPage.items ?? ((await fetchJson(lastPage['@id']).catch(() => null)) as CatalogPage | null)?.items;
  const latestEntry = pageItems?.[pageItems.length - 1]?.catalogEntry;

  if (!latestEntry) return { ok: false, error: `Could not read version metadata for "${packageId}" from NuGet.` };

  return {
    ok: true,
    metadata: {
      name: packageId,
      latestVersion: latestEntry.version ?? '',
      description: latestEntry.description && latestEntry.description.trim() !== '' ? latestEntry.description : null,
      license: latestEntry.licenseExpression && latestEntry.licenseExpression.trim() !== '' ? latestEntry.licenseExpression : null,
      // The registration API doesn't list dependencies at this summary level.
      dependencyCount: null,
    },
  };
}
