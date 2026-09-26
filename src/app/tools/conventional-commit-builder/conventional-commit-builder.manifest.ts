import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'conventional-commit-builder',
  title: 'Conventional Commit Builder',
  description:
    'Builds a Conventional Commits formatted message from a type, scope, subject, body, and footers.',
  category: 'developer',
  keywords: ['conventional commits', 'commit', 'git', 'message', 'builder'],
  route: '/tools/conventional-commit-builder',
  load: () => import('./conventional-commit-builder').then((m) => m.ConventionalCommitBuilder),
  status: 'stable',
  persistence: { input: 'session', preferences: 'local' },
  io: { accepts: ['text'], produces: ['text'] },
};
