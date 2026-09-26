import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'programmer-calculator',
  title: 'Programmer Calculator',
  description:
    'Arithmetic and bitwise (AND/OR/XOR/NOT/shift) calculator with an interactive bit grid, two’s-complement, and 8/16/32/64-bit widths.',
  category: 'developer',
  keywords: [
    'programmer calculator',
    'bitwise',
    'and',
    'or',
    'xor',
    'shift',
    'two’s complement',
    'bit width',
    'hex',
    'binary',
  ],
  route: '/tools/programmer-calculator',
  load: () => import('./programmer-calculator-tool').then((m) => m.ProgrammerCalculatorTool),
  status: 'verified',
  verification: {
    propertyTested: true,
    summary: 'Fuzz-tested width-bounded operand views, bit toggling, and supported operations.',
  },
  persistence: { input: 'session', preferences: 'local' },
  execution: { worker: 'none' },
  io: { accepts: ['text'], produces: ['text'] },
};
