import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'jwks-viewer',
  title: 'JWKS Viewer',
  shortTitle: 'JWKS Viewer',
  description:
    "Inspects a JWKS document — enumerates keys, decodes each JWK's parameters, and flags common problems.",
  category: 'security',
  keywords: ['jwks', 'jwk', 'json web key set', 'public key', 'kid', 'key id', 'oidc', 'jwt'],
  route: '/tools/jwks-viewer',
  load: () => import('./jwks-viewer').then((m) => m.JwksViewer),
  status: 'verified',
  verification: {
    vectors: ['RFC 7517 Appendix A.1 RSA public JWK importability and kid'],
    propertyTested: true,
    summary: 'Fuzz-tested with arbitrary text and arbitrary "keys" array entries (fast-check) -- never rejects/throws.',
  },
  consequenceClass: ['authentication'],
  persistence: { input: 'none', preferences: 'local' },
  io: { accepts: ['text', 'json'], produces: ['json'] },
};
