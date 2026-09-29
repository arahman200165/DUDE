import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'system-changes',
  title: 'System Changes',
  description:
    'Journal of every Windows system change DUDE applied — processes, environment variables, registry, services, tasks, startup entries, features and permissions — with per-change outcomes, previewed undo, backups, retention, and the snapshot library.',
  category: 'developer',
  keywords: ['system changes', 'undo', 'journal', 'rollback', 'registry backup', 'snapshot', 'windows', 'audit'],
  route: '/tools/system-changes',
  load: () => import('./system-changes').then((m) => m.SystemChangesTool),
  status: 'experimental',
  persistence: { input: 'none', preferences: 'local' },
  consequenceClass: ['process-management', 'registry', 'system-config'],
  capabilities: [
    { kind: 'platform', id: 'native-system-write', web: 'unavailable', note: 'undoes journaled Windows system changes through the desktop system mutation engine' },
    { kind: 'platform', id: 'native-system', web: 'unavailable', note: 'manages the local snapshot library used by the environment, PATH and registry diffs' },
  ],
  settingsSection: {
    title: 'System changes & snapshots',
    keywords: ['backup', 'retention', 'undo', 'snapshots', 'registry backup'],
    desktopOnly: true,
    load: () => import('./system-changes.settings').then((m) => m.SystemChangesSettings),
  },
  io: { accepts: ['file'], produces: ['json'] },
};
