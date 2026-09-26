import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'csv-filter-sort',
  title: 'CSV Filter / Sort',
  description: "Filter a CSV's rows by a column condition, and sort by a column.",
  category: 'data',
  keywords: ['csv', 'filter', 'sort', 'query', 'rows'],
  route: '/tools/csv-filter-sort',
  load: () => import('./csv-filter-sort').then((m) => m.CsvFilterSort),
  status: 'stable',
  persistence: { input: 'session', preferences: 'local' },
  execution: { worker: 'optional' },
  io: { accepts: ['text', 'table'], produces: ['table'] },
};
