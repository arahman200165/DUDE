import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'udp-port-tester',
  title: 'UDP Port Tester',
  description: 'Probe one UDP port and show conclusive or inconclusive results.',
  category: 'developer',
  keywords: ['network', 'udp', 'port', 'tester'],
  route: '/tools/udp-port-tester',
  load: () => import('./udp-port-tester').then((m) => m.UdpPortTesterTool),
  status: 'experimental',
  persistence: { input: 'none', preferences: 'none' },
  capabilities: [{ kind: 'platform', id: 'native-network', web: 'unavailable', note: 'runs live checks through the Windows desktop network bridge' }],
  io: { accepts: ['text'], produces: ['json'] },
};
