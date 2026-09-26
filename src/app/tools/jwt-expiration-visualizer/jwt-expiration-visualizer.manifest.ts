import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'jwt-expiration-visualizer',
  title: 'JWT Expiration Visualizer',
  shortTitle: 'JWT Expiry',
  description: "Visualizes a JWT's iat/nbf/exp window on a timeline relative to now.",
  category: 'security',
  keywords: [
    'jwt',
    'expiration',
    'exp',
    'iat',
    'nbf',
    'timeline',
    'ttl',
    'expiry',
    'token lifetime',
  ],
  route: '/tools/jwt-expiration-visualizer',
  load: () => import('./jwt-expiration-visualizer').then((m) => m.JwtExpirationVisualizer),
  status: 'stable',
  consequenceClass: ['authentication'],
  persistence: { input: 'none', preferences: 'local' },
  io: { accepts: ['text'], produces: ['json'] },
};
