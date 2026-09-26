import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'csv-pivot',
  title: 'CSV Pivot',
  description: 'Pivot a CSV: group by a row key and column key, aggregating a value column.',
  category: 'data',
  keywords: ['csv', 'pivot', 'group by', 'aggregate', 'summarize'],
  route: '/tools/csv-pivot',
  load: () => import('./csv-pivot').then((m) => m.CsvPivot),
  status: 'verified',
  verification: {
    propertyTested: true,
    summary: 'Property-tested with fast-check via the shared harness for arbitrary inputs and tool-specific invariants.',
  },
  persistence: { input: 'session', preferences: 'local' },
  execution: { worker: 'optional' },
  io: { accepts: ['text', 'table'], produces: ['table'] },
};
