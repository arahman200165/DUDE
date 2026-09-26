import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'expression-evaluator',
  title: 'Expression Evaluator',
  description:
    'Evaluates a math expression with named variables, functions, units, and matrices via a sandboxed expression parser.',
  category: 'developer',
  keywords: ['expression', 'evaluator', 'calculator', 'math', 'formula', 'variables'],
  route: '/tools/expression-evaluator',
  load: () => import('./expression-evaluator').then((m) => m.ExpressionEvaluator),
  status: 'stable',
  persistence: { input: 'session', preferences: 'none' },
  execution: { worker: 'none' },
  io: { accepts: ['text'], produces: ['text'] },
};
