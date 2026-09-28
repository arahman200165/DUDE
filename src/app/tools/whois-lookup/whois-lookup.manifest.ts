import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'whois-lookup',
  title: 'WHOIS Lookup',
  description: 'Query RDAP registration data with classic WHOIS fallback.',
  category: 'developer',
  keywords: ['network', 'whois', 'lookup'],
  route: '/tools/whois-lookup',
  load: () => import('./whois-lookup').then((m) => m.WhoisLookupTool),
  status: 'experimental',
  persistence: { input: 'none', preferences: 'none' },
  network: { required: true, detail: 'IANA RDAP bootstrap and the RDAP server it names, or WHOIS over TCP 43 (whois.iana.org and its referral, or a custom server)' },
  capabilities: [{ kind: 'platform', id: 'native-network', web: 'unavailable', note: 'runs live checks through the Windows desktop network bridge' }],
  io: { accepts: ['text'], produces: ['json'] },
};
