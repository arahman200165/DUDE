import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'local-network',
  title: 'Local Network Viewer',
  description: 'Inspect bound ports, connections, listeners, neighbors, routes, interfaces, and local addresses.',
  category: 'developer',
  keywords: ['network', 'local', 'network'],
  route: '/tools/local-network',
  load: () => import('./local-network').then((m) => m.LocalNetworkTool),
  status: 'experimental',
  persistence: { input: 'none', preferences: 'none' },
  capabilities: [{ kind: 'platform', id: 'native-network', web: 'unavailable', note: 'runs live checks through the Windows desktop network bridge' }],
  io: { accepts: ['json'], produces: ['json'] },
};
