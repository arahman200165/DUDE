import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'range-generator',
  title: 'Range Generator',
  description:
    'Generates a numeric sequence from a start, end, and step, with zero-padding and newline/comma/JSON output.',
  category: 'developer',
  keywords: ['range', 'sequence', 'generator', 'numbers', 'series'],
  route: '/tools/range-generator',
  load: () => import('./range-generator').then((m) => m.RangeGenerator),
  status: 'stable',
  persistence: { input: 'session', preferences: 'local' },
  execution: { worker: 'none' },
  io: { accepts: ['text'], produces: ['text', 'json'] },
};
