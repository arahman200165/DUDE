import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'large-file-inspector',
  title: 'Large-File Streaming Inspector',
  shortTitle: 'Large File',
  description:
    'Open files of any size on disk without loading them: paged hex view with offset jumps, line-numbered text view, streaming text/regex/byte find, tail -f follow, and range hashing or export.',
  category: 'developer',
  keywords: ['large file', 'huge log', 'log viewer', 'tail', 'tail -f', 'hex viewer', 'streaming', 'gigabyte', 'offset', 'find bytes', 'range hash', 'less'],
  route: '/tools/large-file-inspector',
  load: () => import('./large-file-inspector').then((m) => m.LargeFileInspectorTool),
  status: 'experimental',
  persistence: { input: 'none', preferences: 'local' },
  capabilities: [
    { kind: 'platform', id: 'native-fs', web: 'unavailable', note: 'reads byte ranges and streams search over files of any size on disk' },
    { kind: 'platform', id: 'file-watch', web: 'unavailable', note: 'follows a growing file (tail -f)' },
  ],
  io: { accepts: ['file'], produces: ['bytes', 'text'] },
};
