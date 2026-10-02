// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'url-percent-inspector';
export const binding = {
    load: () => import('./url-percent-inspector').then((m) => m.UrlPercentInspector)
};
