// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'hex-editor';
export const binding = {
    load: () => import('./hex-editor').then((m) => m.HexEditor)
};
