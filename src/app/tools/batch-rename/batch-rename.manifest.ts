import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'batch-rename',
  title: 'Batch Rename',
  description:
    'Rename files and folders on disk by find/replace, regex, tokens (counter, date, parent, hash), case transform, or an old→new list — live preview, Windows-name checks, and undo.',
  category: 'developer',
  keywords: ['batch rename', 'bulk rename', 'rename files', 'mass rename', 'regex rename', 'renamer', 'counter', 'serialize', 'lowercase names', 'slug', 'csv rename'],
  route: '/tools/batch-rename',
  load: () => import('./batch-rename').then((m) => m.BatchRenameTool),
  status: 'experimental',
  persistence: { input: 'none', preferences: 'local' },
  consequenceClass: ['filesystem-write'],
  capabilities: [
    { kind: 'platform', id: 'native-fs', web: 'unavailable', note: 'lists real folders in the desktop fs worker' },
    { kind: 'platform', id: 'native-fs-write', web: 'unavailable', note: 'renames only through a previewed, journaled, undoable plan' },
  ],
  io: { accepts: ['file', 'text'], produces: ['table'] },
};
