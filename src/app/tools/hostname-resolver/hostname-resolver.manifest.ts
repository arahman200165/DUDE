import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'hostname-resolver',
  title: 'Hostname Resolver',
  description: 'Show addresses selected by the Windows system resolver.',
  category: 'developer',
  keywords: ['network', 'hostname', 'resolver'],
  route: '/tools/hostname-resolver',
  load: () => import('./hostname-resolver').then((m) => m.HostnameResolverTool),
  status: 'experimental',
  persistence: { input: 'none', preferences: 'none' },
  network: { required: true, detail: 'the resolver configured in Windows' },
  capabilities: [{ kind: 'platform', id: 'native-network', web: 'unavailable', note: 'runs live checks through the Windows desktop network bridge' }],
  io: { accepts: ['text'], produces: ['json'] },
};
