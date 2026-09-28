import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'network-diagnostic-bundle',
  title: 'Network Diagnostic Bundle Export',
  description: 'Collect selected checks and export a reviewed diagnostic ZIP.',
  category: 'developer',
  keywords: ['network', 'network', 'diagnostic', 'bundle'],
  route: '/tools/network-diagnostic-bundle',
  load: () => import('./network-diagnostic-bundle').then((m) => m.NetworkDiagnosticBundleTool),
  status: 'experimental',
  persistence: { input: 'none', preferences: 'none' },
  network: { required: true, detail: 'only the selected checks, against the one target you enter' },
  consequenceClass: ['network-scanning'],
  capabilities: [{ kind: 'platform', id: 'native-network', web: 'unavailable', note: 'runs live checks through the Windows desktop network bridge' }],
  io: { accepts: ['json'], produces: ['json', 'file'] },
};
