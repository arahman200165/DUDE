import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'jwt-signer',
  title: 'JWT Signer',
  shortTitle: 'JWT Signer',
  description:
    'Sign a JWT with an HMAC secret or an RSA/EC/RSA-PSS private key, with in-browser key-pair generation.',
  category: 'security',
  keywords: [
    'jwt',
    'sign',
    'signature',
    'hmac',
    'rsa',
    'ecdsa',
    'ps256',
    'key pair',
    'auth',
    'token',
  ],
  route: '/tools/jwt-signer',
  load: () => import('./jwt-signer').then((m) => m.JwtSigner),
  status: 'experimental',
  persistence: { input: 'none', preferences: 'local' },
  io: { accepts: ['json', 'text'], produces: ['text'] },
};
