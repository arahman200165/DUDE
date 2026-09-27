import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'reverse-dns',
  title: 'Reverse DNS Lookup',
  description: 'Resolve an IP address to PTR records.',
  category: 'developer',
  keywords: ['network', 'reverse', 'dns'],
  route: '/tools/reverse-dns',
  load: () => import('./reverse-dns').then((m) => m.ReverseDnsTool),
  status: 'experimental',
  persistence: { input: 'none', preferences: 'none' },
  capabilities: [{ kind: 'platform', id: 'native-network', web: 'unavailable', note: 'runs live checks through the Windows desktop network bridge' }],
  io: { accepts: ['text'], produces: ['json'] },
};
