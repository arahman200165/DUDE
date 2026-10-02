// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'json-merge';
export const binding = {
    load: () => import('./json-merge').then((m) => m.JsonMerge)
};
