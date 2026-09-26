import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'pe-header-viewer',
  title: 'PE Header Viewer',
  description:
    "Parses a Windows PE executable's DOS/COFF/Optional headers, section table, data directories, and basic import/export table into a browsable tree.",
  category: 'developer',
  keywords: [
    'pe header',
    'portable executable',
    'exe',
    'dll',
    'coff header',
    'windows executable',
    'import table',
    'export table',
  ],
  route: '/tools/pe-header-viewer',
  load: () => import('./pe-header-viewer').then((m) => m.PeHeaderViewer),
  status: 'stable',
  persistence: { input: 'none', preferences: 'none' },
  io: { accepts: ['file'], produces: ['json'] },
};
