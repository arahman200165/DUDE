import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'jwt-claims-analyzer',
  title: 'JWT Claims Analyzer',
  shortTitle: 'Claims Analyzer',
  description:
    'Decodes a JWT and flags claim-level issues — missing/expired timestamps, risky algorithms, non-standard claims.',
  category: 'security',
  keywords: [
    'jwt',
    'claims',
    'analyze',
    'lint',
    'security',
    'exp',
    'iat',
    'nbf',
    'aud',
    'iss',
    'alg none',
  ],
  route: '/tools/jwt-claims-analyzer',
  load: () => import('./jwt-claims-analyzer').then((m) => m.JwtClaimsAnalyzer),
  status: 'verified',
  verification: {
    propertyTested: true,
    summary: 'Fuzz-tested with arbitrary JSON-shaped header/payload (fast-check) -- caught and fixed a real crash on non-object header/payload input.',
  },
  consequenceClass: ['authentication'],
  persistence: { input: 'none', preferences: 'local' },
  io: { accepts: ['text'], produces: ['json'] },
};
