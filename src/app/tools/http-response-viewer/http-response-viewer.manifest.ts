import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'http-response-viewer',
  title: 'HTTP Response Viewer',
  description:
    'Paste a raw HTTP response to view its status, headers, and body, with automatic JSON pretty-printing.',
  category: 'web',
  keywords: ['http', 'response', 'viewer', 'status', 'headers', 'body', 'json', 'pretty-print'],
  route: '/tools/http-response-viewer',
  load: () => import('./http-response-viewer').then((m) => m.HttpResponseViewer),
  status: 'stable',
  persistence: { input: 'none', preferences: 'none' },
  io: { accepts: ['text'], produces: ['http-response', 'json'] },
};
