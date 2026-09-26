import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'k8s-secret-base64',
  title: 'Kubernetes Base64 Secret Encoder / Decoder',
  shortTitle: 'K8s Secret Base64',
  description:
    "Encodes plaintext key/value pairs into a Secret data: block, or decodes an existing Secret's base64 values back to plaintext.",
  category: 'developer',
  keywords: ['kubernetes', 'k8s', 'secret', 'base64', 'encode', 'decode'],
  route: '/tools/k8s-secret-base64',
  load: () => import('./k8s-secret-base64').then((m) => m.K8sSecretBase64),
  status: 'verified',
  verification: {
    propertyTested: true,
    summary: 'decodeSecretData(encodeSecretData(pairs)) recovers every value exactly for generated key/value arrays (fast-check property test), built on the already-verified base64 codec.',
  },
  consequenceClass: ['secret-management'],
  persistence: { input: 'session', preferences: 'local' },
  io: { accepts: ['text'], produces: ['text'] },
};
