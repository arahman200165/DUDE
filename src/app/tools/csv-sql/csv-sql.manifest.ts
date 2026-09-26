import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'csv-sql',
  title: 'CSV ↔ SQL Converter',
  description:
    'Convert CSV rows or a JSON array of objects to SQL INSERT statements, or parse INSERT statements back into CSV.',
  category: 'data',
  keywords: ['csv', 'sql', 'json', 'insert', 'convert', 'database'],
  route: '/tools/csv-sql',
  load: () => import('./csv-sql').then((m) => m.CsvSql),
  status: 'stable',
  persistence: { input: 'session', preferences: 'local' },
  execution: { worker: 'optional' },
  io: { accepts: ['text', 'table', 'json'], produces: ['text', 'table'] },
};
