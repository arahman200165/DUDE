import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'query-string',
  title: 'Query String Parser / Builder',
  description:
    'Parse a query string or URL into key/value pairs, or build one from scratch — also ready to copy as an application/x-www-form-urlencoded request body.',
  category: 'web',
  keywords: [
    'query string',
    'query params',
    'url',
    'parse',
    'build',
    'search params',
    'form urlencoded',
    'request body',
  ],
  route: '/tools/query-string',
  load: () => import('./query-string').then((m) => m.QueryString),
  status: 'stable',
  persistence: { input: 'session', preferences: 'none' },
  io: { accepts: ['text', 'url', 'json'], produces: ['json', 'url', 'text'] },
};
