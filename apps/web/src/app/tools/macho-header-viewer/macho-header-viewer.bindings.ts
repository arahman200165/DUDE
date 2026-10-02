// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'macho-header-viewer';
export const binding = {
    load: () => import('./macho-header-viewer').then((m) => m.MachoHeaderViewer)
};
