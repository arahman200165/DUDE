import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'cidr-calculator',
  title: 'CIDR Calculator',
  description:
    'Computes the network/broadcast address, usable host range, and host count for an IPv4 CIDR block.',
  category: 'developer',
  keywords: ['cidr', 'ip', 'ipv4', 'subnet', 'network', 'netmask'],
  route: '/tools/cidr-calculator',
  load: () => import('./cidr-calculator').then((m) => m.CidrCalculator),
  status: 'stable',
  persistence: { input: 'session', preferences: 'none' },
  io: { accepts: ['text'], produces: ['text'] },
};
