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
  status: 'experimental',
  persistence: { input: 'none', preferences: 'none' },
  io: { accepts: ['file'], produces: ['json'] },
};
