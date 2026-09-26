import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'env-editor',
  title: '.env Editor',
  description:
    'Edits a .env file as a key/value list or raw text, with quoting handled automatically.',
  category: 'developer',
  keywords: ['env', 'dotenv', 'environment variables', 'editor'],
  route: '/tools/env-editor',
  load: () => import('./env-editor').then((m) => m.EnvEditor),
  status: 'verified',
  verification: {
    propertyTested: true,
    summary: 'Round-trip-tested unique valid keys and arbitrary values through .env serialization and parsing.',
  },
  persistence: { input: 'session', preferences: 'local' },
  io: { accepts: ['text'], produces: ['text', 'file'] },
};
