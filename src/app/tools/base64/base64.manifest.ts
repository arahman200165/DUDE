import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'base64',
  title: 'Base64 Encoder / Decoder',
  description: 'UTF-8-safe text-to-Base64 and Base64-to-text conversion.',
  category: 'encoding',
  keywords: ['base64', 'encode', 'decode', 'encoding', 'utf-8'],
  route: '/tools/base64',
  load: () => import('./base64').then((m) => m.Base64Tool),
  status: 'stable',
  persistence: { input: 'session', preferences: 'local' },
  io: { accepts: ['text'], produces: ['text'] },
};
