import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'unicode-code-point-converter',
  title: 'Unicode Code Point Converter',
  description:
    'Convert between U+XXXX notation, decimal, HTML entities, JS \\u escapes, and UTF-8 hex bytes, single or bulk.',
  category: 'text',
  keywords: ['unicode', 'codepoint', 'u+', 'html entity', 'escape', 'utf-8', 'convert', 'bulk'],
  route: '/tools/unicode-code-point-converter',
  load: () => import('./unicode-code-point-converter').then((m) => m.UnicodeCodePointConverter),
  status: 'verified',
  verification: {
    propertyTested: true,
    summary: 'Round-trip-tested (fast-check): parseCodePointInput(formatCodePoint(cp).uPlus) recovers cp for every valid code point, verified across all supported notations; plus fuzzed for neverThrows.',
  },
  persistence: { input: 'session', preferences: 'local' },
  io: { accepts: ['text'], produces: ['text'] },
};
