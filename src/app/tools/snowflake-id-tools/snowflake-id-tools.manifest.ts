import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'snowflake-id-tools',
  title: 'Snowflake ID Generator / Inspector',
  shortTitle: 'Snowflake Tools',
  description:
    'Generates a Snowflake id (Twitter/X, Discord, Instagram, or custom epoch/bit layout), and inspects an existing id to decode its embedded timestamp, worker id, and sequence.',
  category: 'developer',
  keywords: [
    'snowflake',
    'generate',
    'inspect',
    'identifier',
    'twitter',
    'discord',
    'instagram',
    'epoch',
    'worker id',
  ],
  route: '/tools/snowflake-id-tools',
  load: () => import('./snowflake-id-tools').then((m) => m.SnowflakeIdTools),
  status: 'verified',
  verification: {
    propertyTested: true,
    summary: 'Generator-tested (fast-check): packed and inspected Twitter Snowflake timestamps, worker ids, and sequences.',
  },
  persistence: { input: 'session', preferences: 'local' },
  io: { accepts: ['text'], produces: ['text', 'json'] },
};
