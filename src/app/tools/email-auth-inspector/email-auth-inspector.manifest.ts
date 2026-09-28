import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'email-auth-inspector',
  title: 'Email Auth Inspector',
  shortTitle: 'SPF / DKIM / DMARC',
  description: 'Inspect SPF (include tree, 10-lookup limit, sender IP evaluation), DKIM keys (typed, from pasted headers, or common selectors), and DMARC policy with report authorization.',
  category: 'developer',
  keywords: ['network', 'dns', 'email', 'spf', 'dkim', 'dmarc', 'spf inspector', 'dkim inspector', 'dmarc inspector', 'mail', 'deliverability', 'check_host', 'rua'],
  route: '/tools/email-auth-inspector',
  load: () => import('./email-auth-inspector').then((m) => m.EmailAuthInspectorTool),
  status: 'experimental',
  persistence: { input: 'none', preferences: 'none' },
  network: { required: true, detail: 'your system DNS servers, or a DNS, DoH, or DoT server you choose — TXT/A/AAAA/MX lookups only; pasted headers stay on this machine' },
  capabilities: [{ kind: 'platform', id: 'native-network', web: 'unavailable', note: 'runs live checks through the Windows desktop network bridge' }],
  io: { accepts: ['text'], produces: ['json'] },
};
