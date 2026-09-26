import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'elf-header-viewer',
  title: 'ELF Header Viewer',
  description:
    "Parses a Linux/Unix ELF binary's header, program headers, section headers, and dynamic symbol table (32-bit/64-bit, either endianness) into a browsable tree.",
  category: 'developer',
  keywords: [
    'elf header',
    'elf binary',
    'linux executable',
    'program header',
    'section header',
    'dynamic symbols',
  ],
  route: '/tools/elf-header-viewer',
  load: () => import('./elf-header-viewer').then((m) => m.ElfHeaderViewer),
  status: 'stable',
  persistence: { input: 'none', preferences: 'none' },
  io: { accepts: ['file'], produces: ['json'] },
};
