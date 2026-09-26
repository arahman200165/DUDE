import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'percentage-ratio-calculator',
  title: 'Percentage & Ratio Calculator',
  description:
    'Percentage of, percent-of-what, percent change, ratio simplification, and proportion solving.',
  category: 'developer',
  keywords: ['percentage', 'percent', 'ratio', 'proportion', 'percent change', 'simplify ratio'],
  route: '/tools/percentage-ratio-calculator',
  load: () => import('./percentage-ratio-calculator').then((m) => m.PercentageRatioCalculator),
  status: 'stable',
  persistence: { input: 'session', preferences: 'local' },
  execution: { worker: 'none' },
  io: { accepts: ['text'], produces: ['text'] },
};
