// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'url-inspector';
export const binding = {
    load: () => import('./url-inspector').then((m) => m.UrlInspector)
};
