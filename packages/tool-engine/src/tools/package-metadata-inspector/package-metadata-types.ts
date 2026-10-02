/**
 * Maven Central is deliberately excluded — neither its search API nor its raw repository file
 * server sends an `Access-Control-Allow-Origin` header, so a browser `fetch` can't read the
 * response, and this architecture has no backend to proxy it through.
 */
export type PackageEcosystem = 'npm' | 'pypi' | 'crates' | 'nuget';

export const PACKAGE_ECOSYSTEMS: Record<PackageEcosystem, string> = {
  npm: 'npm',
  pypi: 'PyPI',
  crates: 'crates.io',
  nuget: 'NuGet',
};

export interface PackageMetadata {
  readonly name: string;
  readonly latestVersion: string;
  readonly description: string | null;
  readonly license: string | null;
  /** null when the registry's response doesn't expose a dependency count for this package/version. */
  readonly dependencyCount: number | null;
}

export type PackageLookupResult = { readonly ok: true; readonly metadata: PackageMetadata } | { readonly ok: false; readonly error: string };
