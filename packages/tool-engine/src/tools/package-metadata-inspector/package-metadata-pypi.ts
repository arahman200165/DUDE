import { hostFetch } from "@dude/crypto/host";
import { PackageLookupResult } from "./package-metadata-types.js";

interface PyPiResponse {
  readonly info?: {
    readonly name?: string;
    readonly version?: string;
    readonly summary?: string;
    readonly license?: string;
    readonly requires_dist?: readonly string[] | null;
  };
}

export async function fetchPyPiMetadata(packageName: string): Promise<PackageLookupResult> {
  let response: Response;
  try {
    response = await hostFetch(`https://pypi.org/pypi/${encodeURIComponent(packageName)}/json`);
  } catch {
    return { ok: false, error: 'Network request to pypi.org failed.' };
  }

  if (!response.ok) {
    return { ok: false, error: response.status === 404 ? `"${packageName}" was not found on PyPI.` : `PyPI returned HTTP ${response.status}.` };
  }

  const data = ((await response.json()) ?? {}) as PyPiResponse;
  const info = data.info ?? {};
  const license = info.license && info.license.trim() !== '' ? info.license : null;

  return {
    ok: true,
    metadata: {
      name: info.name ?? packageName,
      latestVersion: info.version ?? '',
      description: info.summary && info.summary.trim() !== '' ? info.summary : null,
      license,
      dependencyCount: info.requires_dist ? info.requires_dist.length : null,
    },
  };
}
