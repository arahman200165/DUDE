import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'oauth-scope-parser',
  title: 'OAuth Scope Parser',
  shortTitle: 'Scope Parser',
  description:
    'Splits an OAuth/OIDC space-delimited scope string into individual scopes with known-scope annotations.',
  category: 'security',
  keywords: ['oauth', 'scope', 'scopes', 'openid', 'permissions', 'space delimited', 'oidc'],
  route: '/tools/oauth-scope-parser',
  load: () => import('./oauth-scope-parser').then((m) => m.OAuthScopeParser),
  status: 'stable',
  persistence: { input: 'none', preferences: 'local' },
  io: { accepts: ['text'], produces: ['json'] },
};
