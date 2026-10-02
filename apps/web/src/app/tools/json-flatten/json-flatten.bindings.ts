// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'json-flatten';
export const binding = {
    load: () => import('./json-flatten').then((m) => m.JsonFlatten)
};
