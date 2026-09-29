import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'startup-programs',
  title: 'Startup Programs',
  description: 'Inspect Windows logon startup entries, startup folders, tasks and auto-start services; change supported StartupApproved states through a reviewed system plan.',
  category: 'developer',
  keywords: ['startup', 'autorun', 'run once', 'startup folder', 'startup approved', 'logon task', 'auto-start service', 'publisher', 'signature', 'Windows'],
  route: '/tools/startup-programs',
  load: () => import('./startup-programs').then((m) => m.StartupProgramsTool),
  status: 'experimental',
  persistence: { input: 'none', preferences: 'local' },
  capabilities: [
    { kind: 'platform', id: 'native-system', web: 'unavailable', note: 'inspects local Windows startup registrations through the desktop system helper' },
    { kind: 'platform', id: 'native-system-write', web: 'unavailable', note: 'changes supported StartupApproved states through the desktop system mutation engine' },
  ],
  consequenceClass: ['system-config'],
  io: { accepts: ['text'], produces: ['json'] },
};
