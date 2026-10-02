// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'base64-image-viewer';
export const binding = {
    load: () => import('./base64-image-viewer').then((m) => m.Base64ImageViewer)
};
