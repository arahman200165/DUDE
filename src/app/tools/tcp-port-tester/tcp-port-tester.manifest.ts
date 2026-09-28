import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'tcp-port-tester',
  title: 'TCP Port Tester',
  description: 'Test one TCP port on an explicit host.',
  category: 'developer',
  keywords: ['network', 'tcp', 'port', 'tester'],
  route: '/tools/tcp-port-tester',
  load: () => import('./tcp-port-tester').then((m) => m.TcpPortTesterTool),
  status: 'experimental',
  persistence: { input: 'none', preferences: 'none' },
  network: { required: true, detail: 'a TCP connection to the host and port you enter' },
  capabilities: [{ kind: 'platform', id: 'native-network', web: 'unavailable', note: 'runs live checks through the Windows desktop network bridge' }],
  io: { accepts: ['text'], produces: ['json'] },
};
