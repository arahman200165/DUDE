import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'csv-pivot',
  title: 'CSV Pivot',
  description: 'Pivot a CSV: group by a row key and column key, aggregating a value column.',
  category: 'data',
  keywords: ['csv', 'pivot', 'group by', 'aggregate', 'summarize'],
  route: '/tools/csv-pivot',
  load: () => import('./csv-pivot').then((m) => m.CsvPivot),
  status: 'stable',
  persistence: { input: 'session', preferences: 'local' },
  execution: { worker: 'optional' },
  io: { accepts: ['text', 'table'], produces: ['table'] },
};
