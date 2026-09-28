import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'dns-propagation',
  title: 'DNS Propagation Tester',
  description: 'Compare a DNS record across public and custom resolvers.',
  category: 'developer',
  keywords: ['network', 'dns', 'propagation'],
  route: '/tools/dns-propagation',
  load: () => import('./dns-propagation').then((m) => m.DnsPropagationTool),
  status: 'experimental',
  persistence: { input: 'none', preferences: 'none' },
  network: { required: true, detail: 'Cloudflare (1.1.1.1), Google (8.8.8.8), Quad9 (9.9.9.9), and an optional custom resolver' },
  capabilities: [{ kind: 'platform', id: 'native-network', web: 'unavailable', note: 'runs live checks through the Windows desktop network bridge' }],
  io: { accepts: ['text'], produces: ['json'] },
};
