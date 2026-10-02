import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'branch-name-generator',
    title: 'Branch Name Generator',
    description: 'Builds a slugified branch name from a type, optional ticket id, and description.',
    category: 'developer',
    keywords: ['branch', 'name', 'git', 'generate', 'slug'],
    route: '/tools/branch-name-generator',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Fuzzed branch-name options for non-throwing string output within configured maximum length.',
    },
    persistence: { input: 'session', preferences: 'local' },
    io: { accepts: ['text'], produces: ['text'] }
};
