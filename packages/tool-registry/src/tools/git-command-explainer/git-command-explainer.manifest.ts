import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'git-command-explainer',
    title: 'Git Command Explainer',
    description: 'Breaks an arbitrary git command down token by token, explaining each subcommand, flag, and positional argument.',
    category: 'developer',
    keywords: ['git', 'command', 'explain', 'flags', 'cli'],
    route: '/tools/git-command-explainer',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Fuzz-tested arbitrary Git command text for crash safety with fast-check.',
    },
    persistence: { input: 'session', preferences: 'none' },
    io: { accepts: ['text'], produces: ['text'] }
};
