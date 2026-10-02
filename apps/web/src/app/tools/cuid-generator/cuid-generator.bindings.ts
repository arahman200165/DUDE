// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'cuid-generator';
export const binding = {
    load: () => import('./cuid-generator').then((m) => m.CuidGenerator)
};
