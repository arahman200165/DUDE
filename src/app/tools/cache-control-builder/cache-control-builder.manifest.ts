import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'cache-control-builder',
  title: 'Cache-Control Builder',
  description:
    'Builds or parses a Cache-Control header from its directives, for either a request or a response, flagging contradictory combinations.',
  category: 'web',
  keywords: ['cache-control', 'header', 'caching', 'max-age', 'no-store', 'no-cache'],
  route: '/tools/cache-control-builder',
  load: () => import('./cache-control-builder').then((m) => m.CacheControlBuilder),
  status: 'stable',
  persistence: { input: 'session', preferences: 'local' },
  io: { accepts: ['text'], produces: ['text', 'json'] },
};
