// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'cbor-viewer';
export const binding = {
    load: () => import('./cbor-viewer').then((m) => m.CborViewer)
};
