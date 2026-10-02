import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'config-merge-tool',
    title: 'Configuration Merge Tool',
    description: 'Merges an ordered list of .env/INI/.properties/YAML/JSON config sources, later sources overriding earlier ones.',
    category: 'developer',
    keywords: ['config', 'merge', 'env', 'ini', 'properties', 'yaml', 'json'],
    route: '/tools/config-merge-tool',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Fuzzed lists of arbitrary config source text and formats, asserting tagged results without throws.',
    },
    persistence: { input: 'session', preferences: 'none' },
    io: { accepts: ['text', 'json'], produces: ['json'] }
};
