import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'batch-operations',
  title: 'Batch Operations',
  shortTitle: 'Batch Ops',
  description:
    'Journal of every change DUDE applied to files on disk: per-file outcomes, previewed undo, backup storage, retention, and remembered folders.',
  category: 'developer',
  keywords: ['batch', 'undo', 'journal', 'history', 'dry run', 'preview', 'rollback', 'backup', 'filesystem', 'recycle bin', 'remembered folders'],
  route: '/tools/batch-operations',
  load: () => import('./batch-operations').then((m) => m.BatchOperationsTool),
  status: 'experimental',
  persistence: { input: 'none', preferences: 'none' },
  consequenceClass: ['filesystem-write'],
  capabilities: [
    { kind: 'platform', id: 'native-fs-write', web: 'unavailable', note: 'undoes journaled file changes through the desktop mutation engine' },
  ],
  settingsSection: {
    title: 'Batch operations & folders',
    keywords: ['backup', 'retention', 'undo', 'remembered folders', 'forget folder', 'grants'],
    desktopOnly: true,
    load: () => import('./batch-operations.settings').then((m) => m.BatchOperationsSettings),
  },
  io: { accepts: ['file'], produces: ['json'] },
};
