import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'number-base',
  title: 'Number Base Converter',
  description: 'Convert whole numbers between binary, octal, decimal, hex, or any base 2–36.',
  category: 'encoding',
  keywords: [
    'number',
    'base',
    'binary',
    'octal',
    'decimal',
    'hex',
    'hexadecimal',
    'radix',
    'convert',
  ],
  route: '/tools/number-base',
  load: () => import('./number-base').then((m) => m.NumberBase),
  status: 'verified',
  verification: {
    propertyTested: true,
    summary: 'Round-trip and fuzz-tested (fast-check) against arbitrary-precision bigints across every base 2-36.',
  },
  persistence: { input: 'local', preferences: 'none' },
  io: { accepts: ['text'], produces: ['text'] },
};
