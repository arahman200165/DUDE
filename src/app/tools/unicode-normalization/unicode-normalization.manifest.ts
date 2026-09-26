import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'unicode-normalization',
  title: 'Unicode Normalization',
  description:
    'Normalize text to NFC, NFD, NFKC, or NFKD, with a before/after code point comparison.',
  category: 'text',
  keywords: ['unicode', 'normalize', 'nfc', 'nfd', 'nfkc', 'nfkd', 'compose', 'decompose'],
  route: '/tools/unicode-normalization',
  load: () => import('./unicode-normalization').then((m) => m.UnicodeNormalization),
  status: 'verified',
  verification: {
    propertyTested: true,
    summary: 'Fuzz-tested (fast-check): neverThrows plus the changed flag and idempotence of repeated normalization verified for arbitrary text across all four forms.',
  },
  persistence: { input: 'session', preferences: 'local' },
  io: { accepts: ['text'], produces: ['text'] },
};
