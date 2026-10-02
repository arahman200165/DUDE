// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'file-base64';
export const binding = {
    load: () => import('./file-base64').then((m) => m.FileBase64)
};
