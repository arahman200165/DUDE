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
    vectors: ['RFC 4180 Section 2 record, quoted comma, CRLF field, and doubled-quote examples'],
    propertyTested: true,
    summary: 'RFC 4180 Section 2 examples parsed to exact fields; arbitrary inputs and tool invariants property-tested. Parsing remains permissive and does not validate every RFC grammar restriction.',
  },
  persistence: { input: 'session', preferences: 'local' },
  execution: { worker: 'optional' },
  io: { accepts: ['text', 'json'], produces: ['table', 'json', 'text'] },
};
