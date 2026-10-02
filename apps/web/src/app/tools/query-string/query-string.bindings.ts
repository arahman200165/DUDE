// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'query-string';
export const binding = {
    load: () => import('./query-string').then((m) => m.QueryString)
};
