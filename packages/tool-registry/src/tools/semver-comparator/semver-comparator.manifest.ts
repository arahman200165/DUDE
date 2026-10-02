import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'semver-comparator',
    title: 'Semantic Version Comparator',
    description: 'Compare, sort, and range-check versions against the Semantic Versioning spec.',
    category: 'developer',
    keywords: ['semver', 'semantic version', 'compare', 'sort', 'range', 'version'],
    route: '/tools/semver-comparator',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Fuzz-tested valid self-comparison and sorting arbitrary version text.',
    },
    persistence: { input: 'session', preferences: 'local' },
    io: { accepts: ['text'], produces: ['json'] }
};
