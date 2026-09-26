import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'config-file-comparator',
  title: 'Config File Comparator',
  description:
    'Diffs two config files as .env, INI, or Java .properties, reporting added, removed, and changed keys.',
  category: 'developer',
  keywords: ['config', 'diff', 'compare', 'env', 'ini', 'properties'],
  route: '/tools/config-file-comparator',
  load: () => import('./config-file-comparator').then((m) => m.ConfigFileComparator),
  status: 'stable',
  persistence: { input: 'session', preferences: 'local' },
  io: { accepts: ['text'], produces: ['text'] },
};
