import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'csv-stats',
  title: 'CSV Column Statistics',
  description:
    'Compute per-column count, empty, distinct, and numeric min/max/mean statistics for a CSV.',
  category: 'data',
  keywords: ['csv', 'statistics', 'stats', 'column', 'analysis', 'min', 'max', 'mean'],
  route: '/tools/csv-stats',
  load: () => import('./csv-stats').then((m) => m.CsvStats),
  status: 'stable',
  persistence: { input: 'session', preferences: 'local' },
  execution: { worker: 'optional' },
  io: { accepts: ['text', 'table'], produces: ['table'] },
};
