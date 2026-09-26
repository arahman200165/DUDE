import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'csv-dedupe',
  title: 'CSV Deduplicator',
  description: 'Remove duplicate rows from a CSV, optionally by a subset of key columns.',
  category: 'data',
  keywords: ['csv', 'dedupe', 'deduplicate', 'unique', 'duplicate'],
  route: '/tools/csv-dedupe',
  load: () => import('./csv-dedupe').then((m) => m.CsvDedupe),
  status: 'verified',
  verification: {
    propertyTested: true,
    summary: 'Property-tested with fast-check via the shared harness for arbitrary inputs and tool-specific invariants.',
  },
  persistence: { input: 'session', preferences: 'local' },
  execution: { worker: 'optional' },
  io: { accepts: ['text', 'table'], produces: ['text', 'table'] },
};
