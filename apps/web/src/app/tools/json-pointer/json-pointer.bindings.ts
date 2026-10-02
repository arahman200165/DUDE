// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'json-pointer';
export const binding = {
    load: () => import('./json-pointer').then((m) => m.JsonPointer)
};
