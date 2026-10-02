// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'ulid-tools';
export const binding = {
    load: () => import('./ulid-tools').then((m) => m.UlidTools)
};
