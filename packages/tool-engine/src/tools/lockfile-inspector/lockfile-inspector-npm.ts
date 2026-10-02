import { NormalizedPackage } from "./lockfile-inspector-types.js";

interface NpmLockPackageV2 {
  readonly version?: string;
  readonly resolved?: string;
  readonly dependencies?: Record<string, string>;
}

interface NpmLockPackageV1 {
  readonly version?: string;
  readonly resolved?: string;
  readonly requires?: Record<string, string>;
  readonly dependencies?: Record<string, NpmLockPackageV1>;
}

/** Parses an already-JSON.parsed package-lock.json, lockfileVersion 1 ("dependencies") or 2/3 ("packages"). */
export function parseNpmLockfile(data: unknown): readonly NormalizedPackage[] {
  const root = data as { packages?: Record<string, NpmLockPackageV2>; dependencies?: Record<string, NpmLockPackageV1> };
  const results: NormalizedPackage[] = [];

  if (root.packages && typeof root.packages === 'object') {
    for (const [path, pkg] of Object.entries(root.packages)) {
      if (path === '') continue; // the root project's own entry, not a dependency
      const name = path.replace(/^.*node_modules\//, '');
      results.push({
        name,
        version: pkg.version ?? '',
        resolved: pkg.resolved ?? null,
        dependencies: pkg.dependencies ? Object.keys(pkg.dependencies) : [],
      });
    }
    return results;
  }

  if (root.dependencies && typeof root.dependencies === 'object') {
    const walk = (dependencies: Record<string, NpmLockPackageV1>): void => {
      for (const [name, pkg] of Object.entries(dependencies)) {
        results.push({
          name,
          version: pkg.version ?? '',
          resolved: pkg.resolved ?? null,
          dependencies: pkg.requires ? Object.keys(pkg.requires) : [],
        });
        if (pkg.dependencies) walk(pkg.dependencies);
      }
    };
    walk(root.dependencies);
  }

  return results;
}
