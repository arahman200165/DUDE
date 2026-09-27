import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'git-diff',
  title: 'Git Repo Browser',
  shortTitle: 'Git Diff',
  description:
    "Browse a local git repository's commit history and diff any two commits, entirely client-side.",
  category: 'developer',
  keywords: ['git', 'repo', 'repository', 'commit', 'diff', 'log', 'history', 'version control'],
  route: '/tools/git-diff',
  load: () => import('./git-diff').then((m) => m.GitDiff),
  capabilities: [
    { kind: 'platform', id: 'native-fs', web: 'fallback', note: 'reads a real .git directory on disk, no upload/zip step' },
  ],
  status: 'verified',
  verification: {
    propertyTested: true,
    summary: 'Fuzz-tested construction of the read-only in-memory filesystem core with arbitrary file contents via fast-check.',
  },
  persistence: { input: 'none', preferences: 'none' },
  io: { accepts: ['file'], produces: ['json'] },
};
