import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'csr-generator-inspector',
  title: 'CSR Generator & Inspector',
  shortTitle: 'CSR Tools',
  description:
    'Generates an RSA CSR (PKCS#10) signed with a pasted private key, or inspects an existing CSR.',
  category: 'security',
  keywords: ['csr', 'certificate signing request', 'pkcs10', 'pkcs#10', 'x.509', 'rsa', 'subject'],
  route: '/tools/csr-generator-inspector',
  load: () => import('./csr-generator-inspector').then((m) => m.CsrGeneratorInspector),
  status: 'stable',
  persistence: { input: 'none', preferences: 'local' },
  io: { accepts: ['text'], produces: ['text', 'json'] },
};
