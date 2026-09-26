import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'smart-quotes-normalizer',
  title: 'Smart Quotes Normalizer',
  description:
    'Convert curly quotes, dashes, and ellipses to straight ASCII equivalents, or the reverse.',
  category: 'text',
  keywords: [
    'smart quotes',
    'curly quotes',
    'straight quotes',
    'typographic',
    'dash',
    'em dash',
    'en dash',
    'ellipsis',
  ],
  route: '/tools/smart-quotes-normalizer',
  load: () => import('./smart-quotes-normalizer').then((m) => m.SmartQuotesNormalizer),
  status: 'stable',
  persistence: { input: 'session', preferences: 'local' },
  io: { accepts: ['text'], produces: ['text'] },
};
