import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'env-json-converter',
  title: '.env ↔ JSON',
  description: 'Converts a .env file to a flat JSON object, or the reverse.',
  category: 'developer',
  keywords: ['env', 'dotenv', 'json', 'convert', 'environment variables'],
  route: '/tools/env-json-converter',
  load: () => import('./env-json-converter').then((m) => m.EnvJsonConverter),
  status: 'stable',
  persistence: { input: 'session', preferences: 'local' },
  io: { accepts: ['text'], produces: ['text', 'json'] },
};
