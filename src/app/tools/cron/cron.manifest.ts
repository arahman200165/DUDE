import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'cron',
  title: 'Cron Expression Parser',
  shortTitle: 'Cron Parser',
  description:
    'Parse a cron expression into a richer human-readable schedule and preview its next or previous run times.',
  category: 'date-time',
  keywords: ['cron', 'crontab', 'schedule', 'next run', 'previous run', 'expression'],
  route: '/tools/cron',
  load: () => import('./cron').then((m) => m.Cron),
  status: 'stable',
  persistence: { input: 'session', preferences: 'local' },
  io: { accepts: ['text'], produces: ['json'] },
};
