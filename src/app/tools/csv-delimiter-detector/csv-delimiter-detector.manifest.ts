import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'csv-delimiter-detector',
  title: 'CSV Delimiter Detector',
  description:
    'Detect the most likely delimiter in a pasted CSV/TSV/PSV sample and preview it as a table.',
  category: 'data',
  keywords: ['csv', 'tsv', 'delimiter', 'detect', 'separator'],
  route: '/tools/csv-delimiter-detector',
  load: () => import('./csv-delimiter-detector').then((m) => m.CsvDelimiterDetector),
  status: 'verified',
  verification: {
    propertyTested: true,
    summary: 'Property-tested with fast-check via the shared harness for arbitrary inputs and tool-specific invariants.',
  },
  persistence: { input: 'session', preferences: 'local' },
  execution: { worker: 'optional' },
  io: { accepts: ['text'], produces: ['table'] },
};
