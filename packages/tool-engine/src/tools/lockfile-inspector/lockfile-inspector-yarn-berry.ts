import { load } from 'js-yaml';
import { NormalizedPackage } from "./lockfile-inspector-types.js";

interface YarnBerryEntry {
  readonly version?: string;
  readonly resolution?: string;
  readonly dependencies?: Record<string, string>;
}

function nameFromDeclaration(declaration: string): string {
  const first = declaration.split(',')[0].trim().replace(/^"|"$/g, '');
  const at = first.lastIndexOf('@');
  return at > 0 ? first.slice(0, at) : first;
}

/** Parses a Yarn Berry (v2+) yarn.lock — YAML with a `__metadata` header and one entry per comma-separated declaration key. */
export function parseYarnBerryLockfile(yamlText: string): readonly NormalizedPackage[] {
  const data = (load(yamlText) as Record<string, YarnBerryEntry> | null) ?? {};
  const results: NormalizedPackage[] = [];

  for (const [key, entry] of Object.entries(data)) {
    if (key === '__metadata') continue;

    results.push({
      name: nameFromDeclaration(key),
      version: entry?.version ?? '',
      resolved: entry?.resolution ?? null,
      dependencies: entry?.dependencies ? Object.keys(entry.dependencies) : [],
    });
  }

  return results;
}
