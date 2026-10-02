// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'chmod-converter';
export const binding = {
    load: () => import('./chmod-converter').then((m) => m.ChmodConverter)
};
