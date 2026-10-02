import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'conventional-commit-builder',
    title: 'Conventional Commit Builder',
    description: 'Builds a Conventional Commits formatted message from a type, scope, subject, body, and footers.',
    category: 'developer',
    keywords: ['conventional commits', 'commit', 'git', 'message', 'builder'],
    route: '/tools/conventional-commit-builder',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Fuzzed commit message options, checking non-throwing string output.',
    },
    persistence: { input: 'session', preferences: 'local' },
    io: { accepts: ['text'], produces: ['text'] }
};
