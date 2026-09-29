import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'windows-features',
  title: 'Windows Features',
  description: 'Inspect Windows optional features and Features on Demand, and preview elevated enable or disable changes.',
  category: 'developer',
  keywords: ['Windows features', 'optional features', 'Features on Demand', 'DISM', 'enable feature', 'disable feature', 'restart required', 'PowerShell'],
  route: '/tools/windows-features',
  load: () => import('./windows-features').then((m) => m.WindowsFeaturesTool),
  status: 'experimental',
  persistence: { input: 'none', preferences: 'local' },
  capabilities: [
    { kind: 'platform', id: 'native-system', web: 'unavailable', note: 'reads Windows optional features and capabilities through PowerShell 7 in Desktop DUDE' },
    { kind: 'platform', id: 'native-system-write', web: 'unavailable', note: 'enables or disables optional features through the previewed desktop system mutation engine' },
  ],
  consequenceClass: ['system-config'],
  io: { accepts: ['text'], produces: ['json'] },
};
