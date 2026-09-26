import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'url-percent-inspector',
  title: 'URL Percent-Encoding Inspector',
  description:
    'Breaks a URL or component down byte-by-byte, grouping percent-encoded UTF-8 sequences and flagging unencoded reserved characters.',
  category: 'web',
  keywords: [
    'url',
    'uri',
    'percent-encoding',
    'percent encode',
    'inspector',
    'byte',
    'utf-8',
    'reserved characters',
  ],
  route: '/tools/url-percent-inspector',
  load: () => import('./url-percent-inspector').then((m) => m.UrlPercentInspector),
  status: 'stable',
  persistence: { input: 'session', preferences: 'none' },
  execution: { worker: 'none' },
  io: { accepts: ['text', 'url'], produces: ['json', 'text'] },
};
