import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'curl-converter',
  title: 'cURL Command Inspector / Converter',
  description:
    'Parse a cURL command into its parts, build one interactively, and export it as code in 15 languages.',
  category: 'web',
  keywords: [
    'curl',
    'http',
    'request',
    'convert',
    'fetch',
    'code export',
    'kotlin',
    'rust',
    'php',
    'ruby',
    'dart',
    'swift',
    'httpx',
  ],
  route: '/tools/curl-converter',
  load: () => import('./curl-converter').then((m) => m.CurlConverter),
  status: 'verified',
  verification: {
    propertyTested: true,
    summary: 'Round-trip and fuzz-tested (fast-check): buildCurlCommand/parseCurl recover a structurally-safe ParsedHttpRequest, plus neverThrows on arbitrary text for both parseCurl and the shell tokenizer.',
  },
  persistence: { input: 'none', preferences: 'local' },
  io: { accepts: ['text', 'json', 'http-response'], produces: ['json', 'text'] },
};
