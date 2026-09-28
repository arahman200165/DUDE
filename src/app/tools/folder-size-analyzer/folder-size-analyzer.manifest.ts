import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'folder-size-analyzer',
  title: 'Folder Size Analyzer',
  shortTitle: 'Folder Sizes',
  description:
    'Recursive, drive-capable disk usage: a sortable size tree, treemap, largest files, and breakdowns by extension and age, with previewed Recycle Bin clean-up.',
  category: 'developer',
  keywords: ['folder size', 'disk usage', 'treesize', 'windirstat', 'du', 'treemap', 'space', 'largest files', 'cleanup', 'drive', 'recycle bin'],
  route: '/tools/folder-size-analyzer',
  load: () => import('./folder-size-analyzer').then((m) => m.FolderSizeAnalyzerTool),
  status: 'experimental',
  persistence: { input: 'none', preferences: 'local' },
  consequenceClass: ['filesystem-write'],
  capabilities: [
    { kind: 'platform', id: 'native-fs', web: 'unavailable', note: 'scans real folders and drives in the desktop fs worker' },
    { kind: 'platform', id: 'native-fs-write', web: 'unavailable', note: 'moves selected items to the Recycle Bin through a previewed, journaled plan' },
  ],
  io: { accepts: ['file'], produces: ['table', 'json'] },
};
