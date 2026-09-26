import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'directory-diff',
  desktopOpen: { directory: true },
  title: 'Directory Diff',
  description:
    'Compare two folders for added/removed/changed files, with a line diff for text files and a hex byte diff for binary files.',
  category: 'text',
  keywords: ['directory', 'folder', 'diff', 'compare', 'binary diff', 'hex', 'files'],
  route: '/tools/directory-diff',
  load: () => import('./directory-diff').then((m) => m.DirectoryDiff),
  status: 'experimental',
  persistence: { input: 'none', preferences: 'none' },
  execution: { worker: 'required' },
  io: { accepts: ['file'], produces: ['json'] },
};
