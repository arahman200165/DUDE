import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'csv-join',
  title: 'CSV Join / Merge',
  description: 'Join two CSVs on a key column, inner or left.',
  category: 'data',
  keywords: ['csv', 'join', 'merge', 'combine', 'key'],
  route: '/tools/csv-join',
  load: () => import('./csv-join').then((m) => m.CsvJoin),
  status: 'stable',
  persistence: { input: 'session', preferences: 'local' },
  execution: { worker: 'optional' },
  io: { accepts: ['text', 'table'], produces: ['table'] },
};
