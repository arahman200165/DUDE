import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'asymmetric-key-generator',
  title: 'Asymmetric Key Generator',
  shortTitle: 'Asymmetric Keys',
  description: 'Generates an RSA, EC, or Ed25519 key pair in-browser, exported as PEM or JWK.',
  category: 'security',
  keywords: [
    'rsa',
    'ec',
    'ecdsa',
    'ed25519',
    'key pair',
    'generate',
    'pem',
    'jwk',
    'public key',
    'private key',
  ],
  route: '/tools/asymmetric-key-generator',
  load: () => import('./asymmetric-key-generator').then((m) => m.AsymmetricKeyGenerator),
  status: 'verified',
  verification: {
    crossChecked: ['openssl pkey -text -noout', 'openssl dgst -sign / -verify round trip'],
    summary: 'A generated RSA-2048 private key was independently loaded, signed, and verified by openssl, confirming standards-compliant PKCS#8 output.',
  },
  consequenceClass: ['crypto'],
  persistence: { input: 'none', preferences: 'local' },
  io: { accepts: ['json'], produces: ['text', 'json'] },
};
