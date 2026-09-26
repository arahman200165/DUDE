import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'oidc-discovery-inspector',
  title: 'OpenID Connect Discovery Document Inspector',
  shortTitle: 'OIDC Discovery',
  description:
    'Inspects a pasted OIDC discovery document (.well-known/openid-configuration) — validates required fields and summarizes capabilities.',
  category: 'security',
  keywords: [
    'oidc',
    'openid connect',
    'discovery',
    'well-known',
    'openid-configuration',
    'issuer',
    'endpoints',
  ],
  route: '/tools/oidc-discovery-inspector',
  load: () => import('./oidc-discovery-inspector').then((m) => m.OidcDiscoveryInspector),
  status: 'stable',
  persistence: { input: 'none', preferences: 'local' },
  io: { accepts: ['text', 'json'], produces: ['json'] },
};
