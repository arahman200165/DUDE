import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'recurrence-rule',
  title: 'Recurrence Rule Calculator',
  description:
    'Expand an iCal-style RRULE recurrence into a list of occurrence dates — event recurrence, distinct from cron trigger schedules.',
  category: 'date-time',
  keywords: ['rrule', 'recurrence', 'recurring', 'ical', 'calendar', 'schedule', 'occurrence'],
  route: '/tools/recurrence-rule',
  load: () => import('./recurrence-rule').then((m) => m.RecurrenceRule),
  status: 'stable',
  persistence: { input: 'session', preferences: 'local' },
  io: { accepts: ['text'], produces: ['json'] },
};
