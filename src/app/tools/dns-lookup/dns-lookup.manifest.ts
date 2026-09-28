import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'dns-lookup',
  title: 'DNS Lookup',
  description: 'Query live DNS records using system, custom, DoH, or DoT resolvers.',
  category: 'developer',
  keywords: ['network', 'dns', 'lookup'],
  route: '/tools/dns-lookup',
  load: () => import('./dns-lookup').then((m) => m.DnsLookupTool),
  status: 'experimental',
  persistence: { input: 'none', preferences: 'none' },
  network: { required: true, detail: 'the system resolver, or a DNS, DoH, or DoT server you choose' },
  capabilities: [{ kind: 'platform', id: 'native-network', web: 'unavailable', note: 'runs live checks through the Windows desktop network bridge' }],
  io: { accepts: ['text'], produces: ['json'] },
};
