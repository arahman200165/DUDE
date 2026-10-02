// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'url-encode';
export const binding = {
    load: () => import('./url-encode').then((m) => m.UrlEncode)
};
