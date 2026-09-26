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
  status: 'verified',
  verification: {
    crossChecked: ['Python pefile 2024.8.26'],
    summary:
      'Golden-corpus test parses a real .NET apphost PE and matches machine/sections/imports read independently by pefile.',
  },
  persistence: { input: 'none', preferences: 'none' },
  io: { accepts: ['file'], produces: ['json'] },
};
