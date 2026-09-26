import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'url-inspector',
  title: 'URL / URI Inspector',
  description:
    'Break a URL down into scheme, host, path, query, and fragment — edit any part, and see a colorized component breakdown.',
  category: 'web',
  keywords: [
    'url',
    'uri',
    'inspector',
    'parse',
    'scheme',
    'host',
    'query',
    'fragment',
    'visualizer',
    'breakdown',
  ],
  route: '/tools/url-inspector',
  load: () => import('./url-inspector').then((m) => m.UrlInspector),
  status: 'stable',
  persistence: { input: 'session', preferences: 'none' },
  io: { accepts: ['text', 'url'], produces: ['json', 'url'] },
};
