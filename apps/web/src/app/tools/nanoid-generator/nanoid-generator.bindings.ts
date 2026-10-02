// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'nanoid-generator';
export const binding = {
    load: () => import('./nanoid-generator').then((m) => m.NanoidGenerator)
};
