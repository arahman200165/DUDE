import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'csv-viewer',
  desktopOpen: { extensions: ['.csv'], inputKey: 'input' },
  title: 'CSV Viewer / Converter',
  description: 'View CSV as a table, and convert between CSV and JSON.',
  category: 'data',
  keywords: ['csv', 'table', 'convert', 'json', 'tsv', 'spreadsheet'],
  route: '/tools/csv-viewer',
  load: () => import('./csv-viewer').then((m) => m.CsvViewer),
  status: 'verified',
  verification: {
    propertyTested: true,
    summary: 'Property-tested with fast-check via the shared harness for arbitrary inputs and tool-specific invariants.',
  },
  persistence: { input: 'session', preferences: 'local' },
  execution: { worker: 'optional' },
  io: { accepts: ['text', 'json'], produces: ['table', 'json', 'text'] },
};
