import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'week-number-calculator',
  title: 'Week Number Calculator',
  description:
    'Convert a date to its ISO-8601 week number and back, and see how many weeks a given week-year has.',
  category: 'date-time',
  keywords: ['week number', 'iso week', 'calendar week', 'iso 8601', 'week year', 'weekday'],
  route: '/tools/week-number-calculator',
  load: () => import('./week-number-calculator').then((m) => m.WeekNumberCalculator),
  status: 'stable',
  persistence: { input: 'session', preferences: 'none' },
  io: { accepts: ['text'], produces: ['json'] },
};
