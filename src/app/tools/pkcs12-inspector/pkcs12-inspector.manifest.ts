import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'pkcs12-inspector',
  title: 'PKCS#12 / PFX Inspector',
  shortTitle: 'PKCS#12 Inspector',
  description: "Inspects a .p12/.pfx file's certificates and private keys given its password.",
  category: 'security',
  keywords: ['pkcs12', 'pfx', 'p12', 'certificate', 'private key', 'keystore', 'bundle'],
  route: '/tools/pkcs12-inspector',
  load: () => import('./pkcs12-inspector').then((m) => m.Pkcs12Inspector),
  status: 'stable',
  persistence: { input: 'none', preferences: 'local' },
  io: { accepts: ['file'], produces: ['json', 'text'] },
};
