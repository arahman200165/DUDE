import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'gitignore-tester',
  title: 'Gitignore Tester',
  description:
    'Tests a list of paths against pasted .gitignore rules, honoring anchoring, trailing-slash directory-only patterns, and "!" negation.',
  category: 'developer',
  keywords: ['gitignore', 'git', 'test', 'ignore', 'glob'],
  route: '/tools/gitignore-tester',
  load: () => import('./gitignore-tester').then((m) => m.GitignoreTester),
  status: 'verified',
  verification: {
    propertyTested: true,
    summary: 'Fuzz-tested arbitrary rules and paths for output count and boolean decisions.',
  },
  persistence: { input: 'session', preferences: 'local' },
  io: { accepts: ['text'], produces: ['table'] },
};
