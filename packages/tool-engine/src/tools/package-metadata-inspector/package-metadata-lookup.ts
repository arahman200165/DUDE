import { fetchCratesIoMetadata } from "./package-metadata-crates.js";
import { fetchNpmMetadata } from "./package-metadata-npm.js";
import { fetchNuGetMetadata } from "./package-metadata-nuget.js";
import { fetchPyPiMetadata } from "./package-metadata-pypi.js";
import { PackageEcosystem, PackageLookupResult } from "./package-metadata-types.js";

const FETCHERS: Record<PackageEcosystem, (name: string) => Promise<PackageLookupResult>> = {
  npm: fetchNpmMetadata,
  pypi: fetchPyPiMetadata,
  crates: fetchCratesIoMetadata,
  nuget: fetchNuGetMetadata,
};

export function lookupPackage(ecosystem: PackageEcosystem, name: string): Promise<PackageLookupResult> {
  if (name.trim() === '') return Promise.resolve({ ok: false, error: 'Enter a package name.' });
  return FETCHERS[ecosystem](name.trim());
}
