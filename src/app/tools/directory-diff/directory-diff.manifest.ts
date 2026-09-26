import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'directory-diff',
  desktopOpen: { directory: true },
  desktopCapabilities: ['compares real folders on disk, not zipped/pasted file lists'],
  title: 'Directory Diff',
  description:
    'Compare two folders for added/removed/changed files, with a line diff for text files and a hex byte diff for binary files.',
  category: 'text',
  keywords: ['directory', 'folder', 'diff', 'compare', 'binary diff', 'hex', 'files'],
  route: '/tools/directory-diff',
  load: () => import('./directory-diff').then((m) => m.DirectoryDiff),
  status: 'verified',
  verification: {
    propertyTested: true,
    summary: 'Fuzz-tested (fast-check) against the pure diffDirectoryPayload core: never throws/rejects for arbitrary file lists, and diffing a payload against an identical copy of itself reports every entry as unchanged.',
  },
  persistence: { input: 'none', preferences: 'none' },
  execution: { worker: 'required' },
  io: { accepts: ['file'], produces: ['json'] },
};
