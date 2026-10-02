import { hostFetch } from "@dude/crypto/host";
import { PackageLookupResult } from "./package-metadata-types.js";

interface NpmRegistryResponse {
  readonly description?: string;
  readonly license?: string | { readonly type?: string };
  readonly 'dist-tags'?: { readonly latest?: string };
  readonly versions?: Record<string, { readonly dependencies?: Record<string, string> }>;
}

export async function fetchNpmMetadata(packageName: string): Promise<PackageLookupResult> {
  let response: Response;
  try {
    response = await hostFetch(`https://registry.npmjs.org/${encodeURIComponent(packageName)}`);
  } catch {
    return { ok: false, error: 'Network request to registry.npmjs.org failed.' };
  }

  if (!response.ok) {
    return { ok: false, error: response.status === 404 ? `"${packageName}" was not found on npm.` : `npm registry returned HTTP ${response.status}.` };
  }

  const data = ((await response.json()) ?? {}) as NpmRegistryResponse;
  const latestVersion = data['dist-tags']?.latest ?? '';
  const license = typeof data.license === 'string' ? data.license : (data.license?.type ?? null);
  const dependencyCount = latestVersion ? Object.keys(data.versions?.[latestVersion]?.dependencies ?? {}).length : null;

  return {
    ok: true,
    metadata: { name: packageName, latestVersion, description: data.description ?? null, license, dependencyCount },
  };
}
