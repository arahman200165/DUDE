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
  status: 'verified',
  verification: {
    propertyTested: true,
    summary: 'Fuzz-tested arbitrary input handling and valid IPv4 prefix alignment/address-count invariants with fixed-seed fast-check.',
  },
  persistence: { input: 'session', preferences: 'none' },
  io: { accepts: ['text'], produces: ['text'] },
};
