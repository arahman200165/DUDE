import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'package-metadata-inspector',
    title: 'Package Metadata Inspector',
    description: "Looks up a package's latest version, description, license, and dependency count on npm, PyPI, crates.io, or NuGet.",
    category: 'developer',
    keywords: ['package', 'npm', 'pypi', 'crates.io', 'nuget', 'registry', 'metadata', 'dependency'],
    route: '/tools/package-metadata-inspector',
    status: 'verified',
    verification: { propertyTested: true, summary: 'Fuzzed all four mocked registry lookups over generated names and malformed JSON; asserted typed results without live network access.' },
    persistence: { input: 'session', preferences: 'local' },
    network: { required: true, detail: 'npm / PyPI / crates.io / NuGet registries' },
    io: { accepts: ['text'], produces: ['json'] }
};
