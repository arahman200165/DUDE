// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'base64';
export const binding = {
    load: () => import('./base64').then((m) => m.Base64Tool)
};
