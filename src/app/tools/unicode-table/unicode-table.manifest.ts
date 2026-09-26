import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'unicode-table',
  title: 'Unicode Table',
  description: 'Browse Unicode characters by block, or search by code point, character, or name.',
  category: 'text',
  keywords: [
    'unicode',
    'table',
    'block',
    'reference',
    'browse',
    'search',
    'codepoint',
    'character name',
  ],
  route: '/tools/unicode-table',
  load: () => import('./unicode-table').then((m) => m.UnicodeTable),
  status: 'experimental',
  persistence: { input: 'session', preferences: 'local' },
  execution: { worker: 'required' },
  io: { accepts: ['text'], produces: ['table'] },
};
