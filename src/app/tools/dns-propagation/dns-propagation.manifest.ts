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
  network: { required: true },
  capabilities: [{ kind: 'platform', id: 'native-network', web: 'unavailable', note: 'runs live checks through the Windows desktop network bridge' }],
  io: { accepts: ['text'], produces: ['json'] },
};
