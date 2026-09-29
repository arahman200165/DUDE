import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'process-viewer',
  title: 'Process Viewer',
  description:
    'Read-only task manager for Windows: live CPU and memory, a parent/child process tree, and per-process command line, environment (with diffs and snapshots), modules with versions and signers, threads, handles and ports.',
  category: 'developer',
  keywords: ['process', 'task manager', 'cpu', 'memory', 'threads', 'modules', 'dll', 'handles', 'open files', 'ports', 'process tree', 'parent process', 'command line', 'environment', 'pid', 'windows'],
  route: '/tools/process-viewer',
  load: () => import('./process-viewer').then((m) => m.ProcessViewerTool),
  status: 'experimental',
  persistence: { input: 'none', preferences: 'local' },
  capabilities: [
    { kind: 'platform', id: 'native-system', web: 'unavailable', note: 'reads running processes and their details through the desktop system helper' },
  ],
  io: { accepts: ['text'], produces: ['json'] },
};
