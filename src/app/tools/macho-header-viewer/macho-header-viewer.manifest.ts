import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'macho-header-viewer',
  title: 'Mach-O Header Viewer',
  description:
    "Parses a macOS/iOS Mach-O binary's mach_header, load commands, and linked dylibs (with versions) -- including fat/universal binaries, listing each architecture slice and drilling into the first.",
  category: 'developer',
  keywords: [
    'mach-o',
    'macho',
    'macos executable',
    'load command',
    'fat binary',
    'universal binary',
    'dylib',
  ],
  route: '/tools/macho-header-viewer',
  load: () => import('./macho-header-viewer').then((m) => m.MachoHeaderViewer),
  status: 'verified',
  verification: {
    crossChecked: ['Python lief 1.0.0'],
    summary:
      'Golden-corpus test parses a real ARM64 Mach-O and matches header/load commands/dylibs read independently by LIEF.',
  },
  persistence: { input: 'none', preferences: 'none' },
  io: { accepts: ['file'], produces: ['json'] },
};
