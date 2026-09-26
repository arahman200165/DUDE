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
  status: 'stable',
  persistence: { input: 'none', preferences: 'none' },
  io: { accepts: ['file'], produces: ['json'] },
};
