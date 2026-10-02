import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'glob-tester',
    title: 'Glob Pattern Tester',
    description: 'Test a glob pattern against a list of sample paths.',
    category: 'developer',
    keywords: ['glob', 'pattern', 'match', 'wildcard', 'test', 'paths', 'gitignore'],
    route: '/tools/glob-tester',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Fuzz-tested arbitrary patterns and paths for non-throwing result shapes.',
    },
    persistence: { input: 'session', preferences: 'local' },
    io: { accepts: ['text'], produces: ['json'] }
};
