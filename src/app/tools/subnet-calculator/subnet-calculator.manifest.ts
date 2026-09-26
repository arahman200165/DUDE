import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'subnet-calculator',
  title: 'Subnet Calculator',
  description:
    'Splits an IPv4 network into a chosen number of equal subnets, or into subnets of a given prefix length.',
  category: 'developer',
  keywords: ['subnet', 'cidr', 'ip', 'ipv4', 'network', 'vlsm'],
  route: '/tools/subnet-calculator',
  load: () => import('./subnet-calculator').then((m) => m.SubnetCalculator),
  status: 'stable',
  persistence: { input: 'session', preferences: 'local' },
  io: { accepts: ['text'], produces: ['table'] },
};
