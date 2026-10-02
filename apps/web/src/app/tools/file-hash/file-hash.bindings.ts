// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'file-hash';
export const binding = {
    load: () => import('./file-hash').then((m) => m.FileHash)
};
