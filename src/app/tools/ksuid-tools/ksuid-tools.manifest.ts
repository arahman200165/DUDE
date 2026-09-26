import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'ksuid-tools',
  title: 'KSUID Generator / Inspector',
  shortTitle: 'KSUID Tools',
  description:
    'Generates a KSUID, and inspects an existing KSUID to decode its embedded timestamp and random payload.',
  category: 'developer',
  keywords: ['ksuid', 'generate', 'inspect', 'identifier', 'base62'],
  route: '/tools/ksuid-tools',
  load: () => import('./ksuid-tools').then((m) => m.KsuidTools),
  status: 'stable',
  persistence: { input: 'session', preferences: 'local' },
  io: { accepts: ['text'], produces: ['text', 'json'] },
};
