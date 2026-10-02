// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'process-viewer';
export const binding = {
    load: () => import('./process-viewer').then((m) => m.ProcessViewerTool)
};
