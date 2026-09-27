import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'env-json-converter',
  title: '.env ↔ JSON',
  description: 'Converts a .env file to a flat JSON object, or the reverse.',
  category: 'developer',
  keywords: ['env', 'dotenv', 'json', 'convert', 'environment variables'],
  route: '/tools/env-json-converter',
  load: () => import('./env-json-converter').then((m) => m.EnvJsonConverter),
  status: 'verified',
  verification: {
    propertyTested: true,
    summary: 'Round-trip-tested valid .env pairs through JSON and fuzz-tested arbitrary text in both directions.',
  },
  persistence: { input: 'session', preferences: 'local' },
  fileInput: { key: 'input', extensions: ['.env'] },
  io: { accepts: ['text', 'file'], produces: ['text', 'json', 'file'] },
};
