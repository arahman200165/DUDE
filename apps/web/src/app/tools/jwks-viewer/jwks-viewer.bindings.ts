// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'jwks-viewer';
export const binding = {
    load: () => import('./jwks-viewer').then((m) => m.JwksViewer)
};
