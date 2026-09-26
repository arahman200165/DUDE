import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'scientific-notation-converter',
  title: 'Scientific Notation Converter',
  description:
    'Converts a number between standard, scientific, and engineering notation with adjustable significant digits.',
  category: 'developer',
  keywords: [
    'scientific notation',
    'engineering notation',
    'exponent',
    'mantissa',
    'significant figures',
  ],
  route: '/tools/scientific-notation-converter',
  load: () => import('./scientific-notation-converter').then((m) => m.ScientificNotationConverter),
  status: 'verified',
  verification: {
    propertyTested: true,
    summary: 'Round-trip tested bounded finite integers through scientific notation.',
  },
  persistence: { input: 'session', preferences: 'local' },
  execution: { worker: 'none' },
  io: { accepts: ['text'], produces: ['text'] },
};
