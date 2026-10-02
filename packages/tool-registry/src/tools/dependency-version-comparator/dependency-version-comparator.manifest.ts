import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'dependency-version-comparator',
    title: 'Dependency Version Comparator',
    description: 'Diffs two pasted dependency lists (package.json-style), classifying each change as added, removed, or a major/minor/patch upgrade or downgrade.',
    category: 'developer',
    keywords: [
        'dependency',
        'version',
        'compare',
        'diff',
        'package.json',
        'upgrade',
        'downgrade',
        'semver',
    ],
    route: '/tools/dependency-version-comparator',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Fuzzed arbitrary dependency lists, checking non-throwing output and sorted entry names.',
    },
    persistence: { input: 'session', preferences: 'none' },
    io: { accepts: ['text'], produces: ['table'] }
};
