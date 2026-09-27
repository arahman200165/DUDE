import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'csv-filter-sort',
  title: 'CSV Filter / Sort',
  description: "Filter a CSV's rows by a column condition, and sort by a column.",
  category: 'data',
  keywords: ['csv', 'filter', 'sort', 'query', 'rows'],
  route: '/tools/csv-filter-sort',
  load: () => import('./csv-filter-sort').then((m) => m.CsvFilterSort),
  status: 'verified',
  verification: {
    propertyTested: true,
    summary: 'Property-tested with fast-check via the shared harness for arbitrary inputs and tool-specific invariants.',
  },
  persistence: { input: 'session', preferences: 'local' },
  fileInput: { key: 'input', extensions: ['.csv', '.tsv'] },
  execution: { worker: 'optional' },
  io: { accepts: ['text', 'table', 'file'], produces: ['table'] },
};
