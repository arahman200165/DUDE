import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'pe-header-viewer',
  title: 'PE Header Viewer',
  description:
    "Parses a Windows PE executable's DOS/COFF/Optional headers, section table, data directories, imports and delay-load imports, exports (ordinal and forwarded), version resource, Authenticode presence, CLR header and PDB/CodeView debug data into a browsable tree.",
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
    'delay load',
    'forwarder',
    'pdb',
    'authenticode',
    'clr',
    'version resource',
  ],
  route: '/tools/pe-header-viewer',
  load: () => import('./pe-header-viewer').then((m) => m.PeHeaderViewer),
  status: 'verified',
  verification: {
    crossChecked: ['Python pefile 2024.8.26', 'MSVC dumpbin 14.44'],
    summary:
      'Golden-corpus test parses a real .NET apphost PE and matches machine/sections/imports read independently by pefile. Imports, delay-loads, exports/forwarders, PDB, CLR header and certificate size were also compared with dumpbin on kernel32.dll, notepad.exe, mmc.exe and a .NET assembly.',
  },
  persistence: { input: 'none', preferences: 'none' },
  io: { accepts: ['file'], produces: ['json'] },
};
