import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'starttls-inspector',
  title: 'STARTTLS Inspector',
  description: 'Negotiate a STARTTLS upgrade for SMTP, IMAP, POP3, FTP, LDAP, PostgreSQL, MySQL, or XMPP, show the plaintext transcript, then inspect the TLS layer and certificate chain.',
  category: 'security',
  keywords: ['starttls', 'smtp', 'imap', 'pop3', 'ftp', 'ldap', 'postgres', 'postgresql', 'mysql', 'xmpp', 'tls', 'mail', 'opportunistic tls'],
  route: '/tools/starttls-inspector',
  load: () => import('./starttls-inspector').then((m) => m.StarttlsInspectorTool),
  status: 'experimental',
  persistence: { input: 'none', preferences: 'none' },
  network: { required: true, detail: 'the host and port you enter (a plaintext protocol negotiation, then a TLS handshake)' },
  capabilities: [{ kind: 'platform', id: 'native-network', web: 'unavailable', note: 'runs live checks through the Windows desktop network bridge' }],
  io: { accepts: ['text'], produces: ['json'] },
};
