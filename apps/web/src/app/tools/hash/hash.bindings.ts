// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'hash';
export const binding = {
    load: () => import('./hash').then((m) => m.Hash)
};
