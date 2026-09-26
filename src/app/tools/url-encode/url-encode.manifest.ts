import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'url-encode',
  title: 'URL Encoder / Decoder',
  description: 'Percent-encode or decode text as a URL component or a full URI.',
  category: 'encoding',
  keywords: ['url', 'uri', 'encode', 'decode', 'percent-encoding', 'escape', 'unescape'],
  route: '/tools/url-encode',
  load: () => import('./url-encode').then((m) => m.UrlEncode),
  status: 'verified',
  verification: {
    vectors: ['RFC 2397 Section 4 percent-escaped data URL example'],
    propertyTested: true,
    summary: 'Round-trip and fuzz-tested (fast-check) against arbitrary Unicode text, in both component and full variants.',
  },
  persistence: { input: 'session', preferences: 'local' },
  io: { accepts: ['text'], produces: ['text'] },
};
