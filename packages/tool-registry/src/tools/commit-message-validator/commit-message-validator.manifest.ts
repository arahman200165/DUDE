import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'commit-message-validator',
    title: 'Commit Message Validator',
    description: 'Validates a commit message against the Conventional Commits spec, flagging format, length, and style issues.',
    category: 'developer',
    keywords: ['conventional commits', 'commit', 'git', 'validate', 'lint'],
    route: '/tools/commit-message-validator',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Fuzzed arbitrary commit message strings, checking non-throwing output and valid issue severities.',
    },
    persistence: { input: 'session', preferences: 'none' },
    io: { accepts: ['text'], produces: ['text'] }
};
