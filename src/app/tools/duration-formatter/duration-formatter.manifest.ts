import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'duration-formatter',
  title: 'Duration Parser / Formatter',
  description: 'Parse a human or ISO 8601 duration and see it in every representation at once.',
  category: 'date-time',
  keywords: ['duration', 'parse', 'format', 'iso 8601', 'milliseconds', 'human readable'],
  route: '/tools/duration-formatter',
  load: () => import('./duration-formatter').then((m) => m.DurationFormatter),
  status: 'stable',
  persistence: { input: 'session', preferences: 'none' },
  io: { accepts: ['text'], produces: ['json'] },
};
