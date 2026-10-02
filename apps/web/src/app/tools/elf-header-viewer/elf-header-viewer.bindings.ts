// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'elf-header-viewer';
export const binding = {
    load: () => import('./elf-header-viewer').then((m) => m.ElfHeaderViewer)
};
