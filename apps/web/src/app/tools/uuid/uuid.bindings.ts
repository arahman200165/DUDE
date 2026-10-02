// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'uuid';
export const binding = {
    load: () => import('./uuid').then((m) => m.Uuid)
};
