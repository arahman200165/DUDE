// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'pe-header-viewer';
export const binding = {
    load: () => import('./pe-header-viewer').then((m) => m.PeHeaderViewer)
};
