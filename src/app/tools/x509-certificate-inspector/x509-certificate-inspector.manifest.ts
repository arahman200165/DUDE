import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'x509-certificate-inspector',
  title: 'X.509 Certificate Inspector',
  shortTitle: 'X.509 Inspector',
  description:
    "Inspects a certificate's subject/issuer, validity, SAN, extensions, and fingerprints.",
  category: 'security',
  keywords: [
    'x.509',
    'certificate',
    'ssl',
    'tls',
    'san',
    'subject alternative name',
    'fingerprint',
    'expiration',
    'pem',
    'der',
  ],
  route: '/tools/x509-certificate-inspector',
  load: () => import('./x509-certificate-inspector').then((m) => m.X509CertificateInspector),
  status: 'stable',
  persistence: { input: 'session', preferences: 'local' },
  io: { accepts: ['text', 'file'], produces: ['json'] },
};
