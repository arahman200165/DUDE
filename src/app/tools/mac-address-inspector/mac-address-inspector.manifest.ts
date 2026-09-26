import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'mac-address-inspector',
  title: 'MAC Address Inspector',
  description:
    'Normalizes a MAC address across colon/hyphen/Cisco-dotted/plain formats, decodes its unicast/multicast and administration bits, and looks up its OUI vendor.',
  category: 'developer',
  keywords: ['mac', 'address', 'oui', 'vendor', 'network', 'ethernet'],
  route: '/tools/mac-address-inspector',
  load: () => import('./mac-address-inspector').then((m) => m.MacAddressInspector),
  status: 'verified',
  verification: {
    propertyTested: true,
    summary: 'Fuzz-tested arbitrary text and checked normalization equivalence across four MAC address formats with fixed-seed fast-check.',
  },
  persistence: { input: 'session', preferences: 'none' },
  io: { accepts: ['text'], produces: ['text'] },
};
