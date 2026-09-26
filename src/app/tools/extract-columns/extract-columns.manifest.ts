import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'extract-columns',
  title: 'Extract Columns',
  description: 'Splits each line on a delimiter and extracts/reorders the selected columns.',
  category: 'text',
  keywords: ['columns', 'delimiter', 'split', 'fields', 'extract', 'csv-like'],
  route: '/tools/extract-columns',
  load: () => import('./extract-columns').then((m) => m.ExtractColumns),
  status: 'verified',
  verification: {
    propertyTested: true,
    summary: 'Fuzz-tested (fast-check): extractColumns/parseColumnSpec never throw, parseColumnSpec only ever returns positive integers, and extractColumns always preserves the input line count.',
  },
  persistence: { input: 'session', preferences: 'local' },
  io: { accepts: ['text'], produces: ['text'] },
};
