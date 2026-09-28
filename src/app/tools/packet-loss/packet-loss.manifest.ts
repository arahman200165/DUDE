import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'packet-loss',
  title: 'Packet-Loss Measurement',
  description: 'Measure ICMP packet loss over a bounded probe sample.',
  category: 'developer',
  keywords: ['network', 'packet', 'loss'],
  route: '/tools/packet-loss',
  load: () => import('./packet-loss').then((m) => m.PacketLossTool),
  status: 'experimental',
  persistence: { input: 'none', preferences: 'none' },
  network: { required: true, detail: 'ICMP echo requests to the host you enter, at most 100 per run' },
  capabilities: [{ kind: 'platform', id: 'native-network', web: 'unavailable', note: 'runs live checks through the Windows desktop network bridge' }],
  io: { accepts: ['text'], produces: ['json'] },
};
