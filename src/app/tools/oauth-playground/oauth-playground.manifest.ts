import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'oauth-playground',
  title: 'OAuth 2.0 Playground',
  shortTitle: 'OAuth Playground',
  description:
    'Builds and inspects OAuth 2.0 / OIDC requests and responses for every grant type, without a live redirect flow.',
  category: 'security',
  keywords: [
    'oauth',
    'oauth2',
    'playground',
    'authorization code',
    'pkce',
    'client credentials',
    'password grant',
    'device flow',
    'implicit',
    'refresh token',
    'grant type',
    'oidc',
  ],
  route: '/tools/oauth-playground',
  load: () => import('./oauth-playground').then((m) => m.OAuthPlayground),
  status: 'stable',
  consequenceClass: ['authentication'],
  persistence: { input: 'none', preferences: 'local' },
  io: { accepts: ['text', 'url'], produces: ['url', 'json'] },
};
