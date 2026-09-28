import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'certificate-watch-list',
  title: 'Certificate Watch List',
  shortTitle: 'Cert Watch',
  description: 'Watch TLS endpoints for expiry and unexpected certificate changes. Opt-in background checks run while DUDE is open, with configurable thresholds and native notifications.',
  category: 'security',
  keywords: ['certificate', 'expiration', 'monitor', 'watch', 'tls', 'ssl', 'expiry', 'renewal', 'notification', 'background', 'dashboard'],
  route: '/tools/certificate-watch-list',
  load: () => import('./certificate-watch-list').then((m) => m.CertificateWatchListTool),
  status: 'experimental',
  persistence: { input: 'none', preferences: 'none' },
  network: { required: true, detail: 'each watched host:port (one TLS handshake per check, on the schedule you set, while DUDE is running)' },
  capabilities: [{ kind: 'platform', id: 'native-network', web: 'unavailable', note: 'runs live checks through the Windows desktop network bridge' }],
  io: { accepts: ['text'], produces: ['json'] },
};
