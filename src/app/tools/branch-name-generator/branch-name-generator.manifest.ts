import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'branch-name-generator',
  title: 'Branch Name Generator',
  description: 'Builds a slugified branch name from a type, optional ticket id, and description.',
  category: 'developer',
  keywords: ['branch', 'name', 'git', 'generate', 'slug'],
  route: '/tools/branch-name-generator',
  load: () => import('./branch-name-generator').then((m) => m.BranchNameGenerator),
  status: 'verified',
  verification: {
    propertyTested: true,
    summary: 'Fuzzed branch-name options for non-throwing string output within configured maximum length.',
  },
  persistence: { input: 'session', preferences: 'local' },
  io: { accepts: ['text'], produces: ['text'] },
};
