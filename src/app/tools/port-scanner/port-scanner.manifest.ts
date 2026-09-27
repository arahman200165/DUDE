import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'port-scanner',
  title: 'Port Scanner',
  description: 'Probe a bounded TCP and UDP port set on one host or CIDR.',
  category: 'developer',
  keywords: ['network', 'port', 'scanner'],
  route: '/tools/port-scanner',
  load: () => import('./port-scanner').then((m) => m.PortScannerTool),
  status: 'experimental',
  persistence: { input: 'none', preferences: 'none' },
  consequenceClass: ['network-scanning'],
  capabilities: [{ kind: 'platform', id: 'native-network', web: 'unavailable', note: 'runs live checks through the Windows desktop network bridge' }],
  io: { accepts: ['text'], produces: ['json'] },
};
