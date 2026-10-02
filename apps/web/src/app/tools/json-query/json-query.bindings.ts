// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'json-query';
export const binding = {
    load: () => import('./json-query').then((m) => m.JsonQuery)
};
