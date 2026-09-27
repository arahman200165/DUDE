import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'connectivity-tester',
  title: 'TCP/HTTP Connectivity Tester',
  description: 'Test an HTTP endpoint with configurable method, headers, and body.',
  category: 'developer',
  keywords: ['network', 'connectivity', 'tester'],
  route: '/tools/connectivity-tester',
  load: () => import('./connectivity-tester').then((m) => m.ConnectivityTesterTool),
  status: 'experimental',
  persistence: { input: 'none', preferences: 'none' },
  consequenceClass: ['remote-write'],
  capabilities: [{ kind: 'platform', id: 'native-network', web: 'unavailable', note: 'runs live checks through the Windows desktop network bridge' }],
  io: { accepts: ['text'], produces: ['json', 'file'] },
};
