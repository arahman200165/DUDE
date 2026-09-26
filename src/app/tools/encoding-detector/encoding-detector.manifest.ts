import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'encoding-detector',
  title: 'Encoding Detector',
  description:
    "Guesses an uploaded file's text encoding from its byte-order mark, or from a UTF-8/ASCII validity check when there is none, with a confidence rating.",
  category: 'developer',
  keywords: ['encoding', 'utf-8', 'utf-16', 'bom', 'byte order mark', 'charset', 'detect encoding'],
  route: '/tools/encoding-detector',
  load: () => import('./encoding-detector').then((m) => m.EncodingDetector),
  status: 'verified',
  verification: { propertyTested: true, summary: 'Property-tested detectEncoding over arbitrary byte arrays and all five supported BOM signatures.' },
  persistence: { input: 'none', preferences: 'none' },
  io: { accepts: ['file'], produces: ['json'] },
};
