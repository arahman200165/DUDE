import { PackageLookupResult } from './package-metadata-types';

interface CratesIoResponse {
  readonly crate?: { readonly name?: string; readonly description?: string; readonly newest_version?: string };
  readonly versions?: readonly { readonly num?: string; readonly license?: string }[];
}

export async function fetchCratesIoMetadata(crateName: string): Promise<PackageLookupResult> {
  let response: Response;
  try {
    // crates.io asks API consumers to send an identifying User-Agent; the browser controls that
    // header on a same-request basis, but the request itself works fine without setting it here.
    response = await fetch(`https://crates.io/api/v1/crates/${encodeURIComponent(crateName)}`);
  } catch {
    return { ok: false, error: 'Network request to crates.io failed.' };
  }

  if (!response.ok) {
    return { ok: false, error: response.status === 404 ? `"${crateName}" was not found on crates.io.` : `crates.io returned HTTP ${response.status}.` };
  }

  const data = ((await response.json()) ?? {}) as CratesIoResponse;
  const latestVersion = data.crate?.newest_version ?? '';
  const versions = Array.isArray(data.versions) ? data.versions : [];
  const latestVersionEntry = versions.find((v) => v && typeof v === 'object' && v.num === latestVersion) ?? versions[0];

  return {
    ok: true,
    metadata: {
      name: data.crate?.name ?? crateName,
      latestVersion,
      description: data.crate?.description ?? null,
      license: latestVersionEntry?.license ?? null,
      // crates.io's crate endpoint doesn't expose a per-version dependency list without a further
      // request to /crates/<name>/<version>/dependencies — out of scope for a single-lookup tool.
      dependencyCount: null,
    },
  };
}
