import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'nanoid-generator',
  title: 'NanoID Generator',
  description: 'Generates NanoIDs with a configurable count, length, and alphabet.',
  category: 'developer',
  keywords: ['nanoid', 'generate', 'identifier', 'random', 'alphabet'],
  route: '/tools/nanoid-generator',
  load: () => import('./nanoid-generator').then((m) => m.NanoidGenerator),
  status: 'stable',
  persistence: { input: 'session', preferences: 'local' },
  io: { accepts: ['json'], produces: ['text'] },
};
