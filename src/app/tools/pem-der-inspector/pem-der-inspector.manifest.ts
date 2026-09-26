import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'pem-der-inspector',
  title: 'PEM / DER Inspector & Converter',
  shortTitle: 'PEM / DER Inspector',
  description:
    'Inspects a PEM block or raw DER bytes as a human-readable ASN.1 tree, and converts between the two.',
  category: 'security',
  keywords: [
    'pem',
    'der',
    'asn.1',
    'asn1',
    'x.509',
    'inspector',
    'converter',
    'certificate',
    'oid',
  ],
  route: '/tools/pem-der-inspector',
  load: () => import('./pem-der-inspector').then((m) => m.PemDerInspector),
  status: 'verified',
  verification: {
    propertyTested: true,
    summary: 'Crosscheck-tested against real Node-crypto (OpenSSL)-generated RSA/EC/Ed25519 PEM keys with an independent base64 extractor, plus fast-check fuzzing.',
  },
  consequenceClass: ['crypto'],
  persistence: { input: 'session', preferences: 'local' },
  io: { accepts: ['text', 'file'], produces: ['text', 'json'] },
};
