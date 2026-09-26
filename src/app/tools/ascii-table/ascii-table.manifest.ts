import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'ascii-table',
  title: 'ASCII Table',
  description:
    'Searchable reference of the 128 standard ASCII characters, with decimal, hex, octal, and control-code names.',
  category: 'text',
  keywords: ['ascii', 'table', 'reference', 'dec', 'hex', 'oct', 'character', 'control code'],
  route: '/tools/ascii-table',
  load: () => import('./ascii-table').then((m) => m.AsciiTable),
  status: 'stable',
  persistence: { input: 'local' },
  io: { accepts: ['text'], produces: ['table'] },
};
