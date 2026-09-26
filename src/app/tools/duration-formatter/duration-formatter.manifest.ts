import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'duration-formatter',
  title: 'Duration Parser / Formatter',
  description: 'Parse a human or ISO 8601 duration and see it in every representation at once.',
  category: 'date-time',
  keywords: ['duration', 'parse', 'format', 'iso 8601', 'milliseconds', 'human readable'],
  route: '/tools/duration-formatter',
  load: () => import('./duration-formatter').then((m) => m.DurationFormatter),
  status: 'verified',
  verification: {
    propertyTested: true,
    summary: 'Round-trip-tested (fast-check): a constructed human-shorthand string recovers the same day/hour/minute/second breakdown, and its iso8601 output re-parses to the same millisecond value; plus neverThrows on arbitrary input.',
  },
  persistence: { input: 'session', preferences: 'none' },
  io: { accepts: ['text'], produces: ['json'] },
};
