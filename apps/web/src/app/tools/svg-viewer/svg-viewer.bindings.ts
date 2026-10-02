// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'svg-viewer';
export const binding = {
    load: () => import('./svg-viewer').then((m) => m.SvgViewer)
};
