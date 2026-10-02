// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'services-viewer';
export const binding = {
    load: () => import('./services-viewer').then((m) => m.ServicesViewerTool)
};
