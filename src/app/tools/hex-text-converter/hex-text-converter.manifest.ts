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
    propertyTested: true,
    summary: 'Round-trip and fuzz-tested (fast-check) across all four encodings (ASCII, UTF-8, UTF-16 LE/BE) against arbitrary text.',
  },
  persistence: { input: 'session', preferences: 'local' },
  execution: { worker: 'none' },
  io: { accepts: ['text'], produces: ['text'] },
};
