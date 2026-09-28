import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'latency-monitor',
  title: 'Continuous Ping / Latency Graph',
  description: 'Monitor ICMP latency over a bounded interval.',
  category: 'developer',
  keywords: ['network', 'latency', 'monitor'],
  route: '/tools/latency-monitor',
  load: () => import('./latency-monitor').then((m) => m.LatencyMonitorTool),
  status: 'experimental',
  persistence: { input: 'none', preferences: 'none' },
  network: { required: true, detail: 'ICMP echo requests to the host you enter, for at most one hour' },
  capabilities: [{ kind: 'platform', id: 'native-network', web: 'unavailable', note: 'runs live checks through the Windows desktop network bridge' }],
  io: { accepts: ['text'], produces: ['json'] },
};
