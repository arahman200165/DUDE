// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'url-safety-inspector';
export const binding = {
    load: () => import('./url-safety-inspector').then((m) => m.UrlSafetyInspector)
};
