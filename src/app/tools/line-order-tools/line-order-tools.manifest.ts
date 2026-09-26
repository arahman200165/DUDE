import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'line-order-tools',
  title: 'Line Order Tools',
  shortTitle: 'Line Order',
  description:
    'Sort (ascending, descending, natural, or by length), shuffle, or reverse the lines of a text block.',
  category: 'text',
  keywords: ['sort', 'shuffle', 'reverse', 'lines', 'natural sort', 'order'],
  route: '/tools/line-order-tools',
  load: () => import('./line-order-tools').then((m) => m.LineOrderTools),
  status: 'verified',
  verification: {
    propertyTested: true,
    summary: 'Fuzz-tested (fast-check): reverseLines is an involution, and sortLines/shuffleLines never add, remove, or change a line -- only reorder them.',
  },
  persistence: { input: 'session', preferences: 'local' },
  io: { accepts: ['text'], produces: ['text'] },
};
