// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'json-sort-keys';
export const binding = {
    load: () => import('./json-sort-keys').then((m) => m.JsonSortKeys)
};
