// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'json';
export const binding = {
    load: () => import('./json').then((m) => m.Json)
};
