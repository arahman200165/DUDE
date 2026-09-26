import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'hex-text-converter',
  title: 'Hex ↔ Text Converter',
  description: 'Convert between raw hex bytes and ASCII, UTF-8, or UTF-16 (LE/BE) text.',
  category: 'encoding',
  keywords: ['hex', 'hexadecimal', 'text', 'ascii', 'utf-8', 'utf-16', 'encode', 'decode', 'bytes'],
  route: '/tools/hex-text-converter',
  load: () => import('./hex-text-converter').then((m) => m.HexTextConverter),
  status: 'verified',
  verification: {
    vectors: ['RFC 4648 Section 10 Base16 test vectors (f, fo, foo, foob, fooba, foobar)'],
    propertyTested: true,
    summary: 'Matches the RFC 4648 Base16 literal vectors and round-trip/fuzz-tested (fast-check) across ASCII, UTF-8, UTF-16 LE, and UTF-16 BE.',
  },
  persistence: { input: 'session', preferences: 'local' },
  execution: { worker: 'none' },
  io: { accepts: ['text'], produces: ['text'] },
};
