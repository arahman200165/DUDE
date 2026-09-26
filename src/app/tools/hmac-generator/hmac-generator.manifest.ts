import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'hmac-generator',
  title: 'HMAC Generator',
  description:
    'HMAC-SHA1, HMAC-SHA256, HMAC-SHA384, and HMAC-SHA512 message authentication codes with a custom key.',
  category: 'security',
  keywords: ['hmac', 'mac', 'message authentication code', 'hash', 'sha256', 'sha512', 'signature'],
  route: '/tools/hmac-generator',
  load: () => import('./hmac-generator').then((m) => m.HmacGenerator),
  status: 'stable',
  persistence: { input: 'none', preferences: 'local' },
  io: { accepts: ['text'], produces: ['text'] },
};
