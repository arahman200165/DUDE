import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'certificate-chain-tools',
  title: 'Certificate Chain Viewer & Builder',
  shortTitle: 'Certificate Chain',
  description: 'Splits, reorders, verifies, and re-assembles a multi-certificate PEM chain bundle.',
  category: 'security',
  keywords: [
    'certificate chain',
    'ca bundle',
    'intermediate',
    'root ca',
    'x.509',
    'pem bundle',
    'chain of trust',
  ],
  route: '/tools/certificate-chain-tools',
  load: () => import('./certificate-chain-tools').then((m) => m.CertificateChainTools),
  status: 'stable',
  persistence: { input: 'session', preferences: 'local' },
  io: { accepts: ['file', 'text'], produces: ['file', 'text', 'json'] },
};
