import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'glob-tester',
  title: 'Glob Pattern Tester',
  description: 'Test a glob pattern against a list of sample paths.',
  category: 'developer',
  keywords: ['glob', 'pattern', 'match', 'wildcard', 'test', 'paths', 'gitignore'],
  route: '/tools/glob-tester',
  load: () => import('./glob-tester').then((m) => m.GlobTester),
  status: 'verified',
  verification: {
    propertyTested: true,
    summary: 'Fuzz-tested arbitrary patterns and paths for non-throwing result shapes.',
  },
  persistence: { input: 'session', preferences: 'local' },
  io: { accepts: ['text'], produces: ['json'] },
};
