import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'file-split-join',
  title: 'File Split & Join',
  shortTitle: 'Split & Join',
  description:
    'Split a file by size, part count or whole lines (repeat a CSV header) with .001 / split-style / -001.ext naming and a SHA-256 checksum file; detect part sets and join them back with verification.',
  category: 'developer',
  keywords: ['split file', 'join files', 'merge parts', 'chunk', '.001', 'hjsplit', 'split -b', 'csv split', 'reassemble', 'checksum', 'sha256'],
  route: '/tools/file-split-join',
  load: () => import('./file-split-join').then((m) => m.FileSplitJoinTool),
  status: 'experimental',
  persistence: { input: 'none', preferences: 'local' },
  consequenceClass: ['filesystem-write'],
  capabilities: [
    { kind: 'platform', id: 'native-fs', web: 'unavailable', note: 'reads real files and part folders in the desktop fs worker' },
    { kind: 'platform', id: 'native-fs-write', web: 'unavailable', note: 'writes parts and joined files only through a previewed, verified, journaled plan' },
  ],
  io: { accepts: ['file'], produces: ['file'] },
};
