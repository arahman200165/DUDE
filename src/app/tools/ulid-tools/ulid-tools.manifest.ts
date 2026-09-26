import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'ulid-tools',
  title: 'ULID Generator / Inspector',
  shortTitle: 'ULID Tools',
  description:
    'Generates a ULID (optionally monotonic), and inspects an existing ULID to decode its embedded timestamp and randomness component.',
  category: 'developer',
  keywords: ['ulid', 'generate', 'inspect', 'identifier', 'monotonic', 'crockford', 'base32'],
  route: '/tools/ulid-tools',
  load: () => import('./ulid-tools').then((m) => m.UlidTools),
  status: 'stable',
  persistence: { input: 'session', preferences: 'local' },
  io: { accepts: ['text'], produces: ['text', 'json'] },
};
