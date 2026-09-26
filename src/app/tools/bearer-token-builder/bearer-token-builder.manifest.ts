import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'bearer-token-builder',
  title: 'Bearer Token Builder',
  shortTitle: 'Bearer Token',
  description:
    'Wraps a token into a properly formatted Bearer Authorization header, with format validation.',
  category: 'security',
  keywords: ['bearer token', 'authorization header', 'http auth', 'access token', 'rfc 6750'],
  route: '/tools/bearer-token-builder',
  load: () => import('./bearer-token-builder').then((m) => m.BearerTokenBuilder),
  status: 'stable',
  consequenceClass: ['authentication'],
  persistence: { input: 'none', preferences: 'local' },
  io: { accepts: ['text'], produces: ['text'] },
};
