import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'matrix-calculator',
  title: 'Matrix Calculator',
  description:
    'Adds, subtracts, multiplies, transposes, inverts, or finds the determinant of matrices entered as rows of numbers.',
  category: 'developer',
  keywords: ['matrix', 'determinant', 'inverse', 'transpose', 'linear algebra'],
  route: '/tools/matrix-calculator',
  load: () => import('./matrix-calculator').then((m) => m.MatrixCalculatorTool),
  status: 'verified',
  verification: {
    propertyTested: true,
    summary: 'Fuzz-tested (fast-check): adding a zero matrix preserves generated rectangular matrices.',
  },
  persistence: { input: 'session', preferences: 'local' },
  execution: { worker: 'optional' },
  io: { accepts: ['text', 'table'], produces: ['text', 'table'] },
};
