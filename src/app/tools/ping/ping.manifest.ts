import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'ping',
  title: 'Ping',
  description: 'Send ICMP echo requests and show round-trip latency.',
  category: 'developer',
  keywords: ['network', 'ping'],
  route: '/tools/ping',
  load: () => import('./ping').then((m) => m.PingTool),
  status: 'experimental',
  persistence: { input: 'none', preferences: 'none' },
  capabilities: [{ kind: 'platform', id: 'native-network', web: 'unavailable', note: 'runs live checks through the Windows desktop network bridge' }],
  io: { accepts: ['text'], produces: ['json'] },
};
