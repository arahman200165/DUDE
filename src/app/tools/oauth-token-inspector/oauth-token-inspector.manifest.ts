import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'oauth-token-inspector',
  title: 'OAuth Token Inspector',
  shortTitle: 'Token Inspector',
  description:
    'Inspects an OAuth access/refresh/ID token — auto-detects JWT vs opaque, decodes claims and scope, flags expiry.',
  category: 'security',
  keywords: [
    'oauth',
    'access token',
    'refresh token',
    'opaque token',
    'introspection',
    'bearer',
    'jwt',
  ],
  route: '/tools/oauth-token-inspector',
  load: () => import('./oauth-token-inspector').then((m) => m.OAuthTokenInspector),
  status: 'stable',
  persistence: { input: 'none', preferences: 'local' },
  io: { accepts: ['text'], produces: ['json'] },
};
