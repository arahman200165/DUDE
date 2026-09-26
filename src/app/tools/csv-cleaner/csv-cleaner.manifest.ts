import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'csv-cleaner',
  title: 'CSV Cleaner',
  description: 'Trim whitespace, drop empty rows, and normalize a messy CSV.',
  category: 'data',
  keywords: ['csv', 'clean', 'trim', 'whitespace', 'empty rows', 'normalize'],
  route: '/tools/csv-cleaner',
  load: () => import('./csv-cleaner').then((m) => m.CsvCleaner),
  status: 'verified',
  verification: {
    propertyTested: true,
    summary: 'Property-tested with fast-check via the shared harness for arbitrary inputs and tool-specific invariants.',
  },
  persistence: { input: 'session', preferences: 'local' },
  execution: { worker: 'optional' },
  io: { accepts: ['text', 'table'], produces: ['text', 'table'] },
};
