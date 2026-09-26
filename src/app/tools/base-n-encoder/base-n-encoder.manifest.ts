import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'base-n-encoder',
  title: 'Base-N Encoder / Decoder',
  description:
    'Encode or decode text as Binary, Base16, Base32, Base36, Base58, Base62, Base85/ASCII85, or basE91.',
  category: 'encoding',
  keywords: [
    'base32',
    'base36',
    'base58',
    'base62',
    'base85',
    'ascii85',
    'base91',
    'binary',
    'encode',
    'decode',
    'radix',
  ],
  route: '/tools/base-n-encoder',
  load: () => import('./base-n-encoder').then((m) => m.BaseNEncoder),
  status: 'stable',
  persistence: { input: 'session', preferences: 'local' },
  execution: { worker: 'none' },
  io: { accepts: ['text'], produces: ['text'] },
};
