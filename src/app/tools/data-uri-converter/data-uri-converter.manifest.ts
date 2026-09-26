import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'data-uri-converter',
  title: 'Data URI Converter',
  description:
    'Generates a data: URI from a file or text, or decodes one back to a previewable, downloadable file.',
  category: 'encoding',
  keywords: ['data uri', 'data url', 'base64', 'embed', 'rfc 2397', 'inline'],
  route: '/tools/data-uri-converter',
  load: () => import('./data-uri-converter').then((m) => m.DataUriConverter),
  status: 'stable',
  persistence: { input: 'session', preferences: 'local' },
  execution: { worker: 'none' },
  io: { accepts: ['file', 'text', 'bytes'], produces: ['text', 'file', 'bytes'] },
};
