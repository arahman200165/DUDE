import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'scheduled-tasks',
  title: 'Scheduled Tasks',
  description: 'Inspect Windows scheduled tasks, triggers, actions, principals and run results. Enable or disable a task through a previewed system change.',
  category: 'developer',
  keywords: ['scheduled tasks', 'task scheduler', 'triggers', 'last run', 'next run', 'enable task', 'disable task', 'schtasks', 'Windows'],
  route: '/tools/scheduled-tasks',
  load: () => import('./scheduled-tasks').then((m) => m.ScheduledTasksTool),
  status: 'experimental',
  persistence: { input: 'none', preferences: 'local' },
  capabilities: [
    { kind: 'platform', id: 'native-system', web: 'unavailable', note: 'reads scheduled tasks through a fixed PowerShell 7 script in the desktop app' },
    { kind: 'platform', id: 'native-system-write', web: 'unavailable', note: 'enables or disables tasks through the desktop system mutation engine' },
  ],
  consequenceClass: ['system-config'],
  io: { accepts: ['text'], produces: ['json'] },
};
