import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'numeric-representation-inspector',
  title: 'Numeric Representation Inspector',
  description:
    "Inspects a value's byte-order (endianness), IEEE-754 float bit layout, or integer representation across bit widths.",
  category: 'developer',
  keywords: [
    'endianness',
    'little-endian',
    'big-endian',
    'ieee 754',
    'float',
    'double',
    'integer',
    'bit width',
    'binary',
  ],
  route: '/tools/numeric-representation-inspector',
  load: () =>
    import('./numeric-representation-inspector').then((m) => m.NumericRepresentationInspector),
  status: 'stable',
  persistence: { input: 'session', preferences: 'local' },
  execution: { worker: 'none' },
  io: { accepts: ['text'], produces: ['json', 'text'] },
};
