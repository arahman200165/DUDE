import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'traceroute',
  title: 'Traceroute',
  description: 'Trace the network path to an explicit host.',
  category: 'developer',
  keywords: ['network', 'traceroute'],
  route: '/tools/traceroute',
  load: () => import('./traceroute').then((m) => m.TracerouteTool),
  status: 'experimental',
  persistence: { input: 'none', preferences: 'none' },
  network: { required: true, detail: 'hop-limited ICMP probes to the host you enter' },
  capabilities: [{ kind: 'platform', id: 'native-network', web: 'unavailable', note: 'runs live checks through the Windows desktop network bridge' }],
  io: { accepts: ['text'], produces: ['json'] },
};
