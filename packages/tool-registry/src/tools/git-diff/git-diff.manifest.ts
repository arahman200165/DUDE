import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'git-diff',
    title: 'Git Repo Browser',
    shortTitle: 'Git Diff',
    description: "Browse a local git repository's commit history and diff any two commits, entirely client-side.",
    category: 'developer',
    keywords: ['git', 'repo', 'repository', 'commit', 'diff', 'log', 'history', 'version control'],
    route: '/tools/git-diff',
    capabilities: [
        { kind: 'platform', id: 'native-fs', web: 'fallback', note: 'reads a real .git directory on disk, no upload/zip step' },
        { kind: 'platform', id: 'file-watch', web: 'unavailable', note: 'optionally refreshes the worktree and git metadata when they change' },
    ],
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Fuzz-tested construction of the read-only in-memory filesystem core with arbitrary file contents via fast-check.',
    },
    persistence: { input: 'none', preferences: 'local' },
    io: { accepts: ['file'], produces: ['json'] }
};
