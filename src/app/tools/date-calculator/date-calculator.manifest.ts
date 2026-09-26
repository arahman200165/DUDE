import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'date-calculator',
  title: 'Date Calculator',
  description:
    'Add/subtract calendar or business days from a date, and count days/weekdays/business-days between two dates.',
  category: 'date-time',
  keywords: [
    'date',
    'calculator',
    'business days',
    'weekdays',
    'holidays',
    'add days',
    'days between',
  ],
  route: '/tools/date-calculator',
  load: () => import('./date-calculator').then((m) => m.DateCalculator),
  status: 'stable',
  persistence: { input: 'session', preferences: 'local' },
  io: { accepts: ['text'], produces: ['json'] },
};
