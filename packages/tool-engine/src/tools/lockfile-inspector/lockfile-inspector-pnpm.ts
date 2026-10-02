import { load } from 'js-yaml';
import { NormalizedPackage } from "./lockfile-inspector-types.js";

interface PnpmPackageEntry {
  readonly resolution?: { readonly integrity?: string };
  readonly dependencies?: Record<string, string>;
}

/**
 * pnpm-lock.yaml package keys look like "/lodash@4.17.21" (older) or "lodash@4.17.21" (newer),
 * possibly with a "_<peerDepsHash>" suffix on the version for packages with peer dependencies.
 */
function parsePackageKey(key: string): { readonly name: string; readonly version: string } | null {
  const withoutLeadingSlash = key.startsWith('/') ? key.slice(1) : key;
  const at = withoutLeadingSlash.lastIndexOf('@');
  if (at <= 0) return null;

  const name = withoutLeadingSlash.slice(0, at);
  const versionAndHash = withoutLeadingSlash.slice(at + 1);
  const version = versionAndHash.split('_')[0];
  return { name, version };
}

export function parsePnpmLockfile(yamlText: string): readonly NormalizedPackage[] {
  const data = load(yamlText) as { packages?: Record<string, PnpmPackageEntry> } | null;
  const packages = data?.packages ?? {};

  const results: NormalizedPackage[] = [];
  for (const [key, entry] of Object.entries(packages)) {
    const parsedKey = parsePackageKey(key);
    if (!parsedKey) continue;

    results.push({
      name: parsedKey.name,
      version: parsedKey.version,
      resolved: entry?.resolution?.integrity ?? null,
      dependencies: entry?.dependencies ? Object.keys(entry.dependencies) : [],
    });
  }

  return results;
}
