import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'csv-cleaner',
  title: 'CSV Cleaner',
  description: 'Trim whitespace, drop empty rows, and normalize a messy CSV.',
  category: 'data',
  keywords: ['csv', 'clean', 'trim', 'whitespace', 'empty rows', 'normalize'],
  route: '/tools/csv-cleaner',
  load: () => import('./csv-cleaner').then((m) => m.CsvCleaner),
  status: 'stable',
  persistence: { input: 'session', preferences: 'local' },
  execution: { worker: 'optional' },
  io: { accepts: ['text', 'table'], produces: ['text', 'table'] },
};
