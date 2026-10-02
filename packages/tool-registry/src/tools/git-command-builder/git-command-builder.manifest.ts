import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'git-command-builder',
    title: 'Git Command Builder',
    description: 'Builds a git command from a subcommand and its common flags — clone, commit, branch, merge, rebase, reset, tag, push, pull, log, and stash.',
    category: 'developer',
    keywords: ['git', 'command', 'builder', 'cli', 'commit', 'push', 'pull', 'rebase', 'merge'],
    route: '/tools/git-command-builder',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Fuzz-tested command assembly across supported subcommands and arbitrary field text with fast-check.',
    },
    persistence: { input: 'session', preferences: 'local' },
    io: { accepts: ['text'], produces: ['text'] }
};
