import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'mtu-discovery',
  title: 'MTU Discovery',
  description: 'Probe path MTU for an explicit IPv4 or IPv6 target.',
  category: 'developer',
  keywords: ['network', 'mtu', 'discovery'],
  route: '/tools/mtu-discovery',
  load: () => import('./mtu-discovery').then((m) => m.MtuDiscoveryTool),
  status: 'experimental',
  persistence: { input: 'none', preferences: 'none' },
  capabilities: [{ kind: 'platform', id: 'native-network', web: 'unavailable', note: 'runs live checks through the Windows desktop network bridge' }],
  io: { accepts: ['text'], produces: ['json'] },
};
