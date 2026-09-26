import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'env-diff',
  title: '.env Diff',
  description: 'Diffs two .env files, reporting added, removed, and changed variables.',
  category: 'developer',
  keywords: ['env', 'dotenv', 'diff', 'compare', 'environment variables'],
  route: '/tools/env-diff',
  load: () => import('./env-diff').then((m) => m.EnvDiff),
  status: 'stable',
  persistence: { input: 'session', preferences: 'none' },
  io: { accepts: ['text'], produces: ['text'] },
};
