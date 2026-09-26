import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'line-prefix-numbering',
  title: 'Line Prefix/Suffix & Numbering',
  shortTitle: 'Line Prefix/Numbering',
  description:
    'Add a prefix/suffix, add or remove line numbers, or apply a transform to every line at once.',
  category: 'text',
  keywords: [
    'prefix',
    'suffix',
    'line numbers',
    'numbering',
    'per-line',
    'transform',
    'uppercase',
    'wrap',
    'quotes',
  ],
  route: '/tools/line-prefix-numbering',
  load: () => import('./line-prefix-numbering').then((m) => m.LinePrefixNumbering),
  status: 'stable',
  persistence: { input: 'session', preferences: 'local' },
  io: { accepts: ['text'], produces: ['text'] },
};
