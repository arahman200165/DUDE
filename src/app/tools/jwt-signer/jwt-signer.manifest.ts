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
  status: 'verified',
  verification: {
    crossChecked: ["Node's crypto.createHmac (independent of jose's own verification)"],
    summary: 'HS256 signature output matches a byte-for-byte independent recomputation with Node\'s crypto.createHmac.',
  },
  consequenceClass: ['authentication'],
  persistence: { input: 'none', preferences: 'local' },
  io: { accepts: ['json', 'text'], produces: ['text'] },
};
