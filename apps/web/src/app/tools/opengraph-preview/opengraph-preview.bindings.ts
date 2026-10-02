// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'opengraph-preview';
export const binding = {
    load: () => import('./opengraph-preview').then((m) => m.OpengraphPreview)
};
