import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'elf-header-viewer',
    title: 'ELF Header Viewer',
    description: "Parses a Linux/Unix ELF binary's header, program headers, section headers, and dynamic symbol table (32-bit/64-bit, either endianness) into a browsable tree.",
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
    status: 'verified',
    verification: {
        crossChecked: ['Python pyelftools'],
        summary: 'Golden-corpus test parses a real x86-64 ELF and matches segments/sections/dynamic symbols read independently by pyelftools.',
    },
    persistence: { input: 'none', preferences: 'none' },
    io: { accepts: ['file'], produces: ['json'] }
};
