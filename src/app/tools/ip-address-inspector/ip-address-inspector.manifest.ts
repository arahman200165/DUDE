import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'ip-address-inspector',
  title: 'IP Address Inspector',
  description:
    'Inspects an IPv4 or IPv6 address — canonical form, classification (private/loopback/multicast/etc.), and binary/expanded/integer view.',
  category: 'developer',
  keywords: ['ip', 'ipv4', 'ipv6', 'inspect', 'network', 'address'],
  route: '/tools/ip-address-inspector',
  load: () => import('./ip-address-inspector').then((m) => m.IpAddressInspector),
  status: 'stable',
  persistence: { input: 'session', preferences: 'none' },
  io: { accepts: ['text'], produces: ['text'] },
};
