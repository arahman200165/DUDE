// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'url-normalizer';
export const binding = {
    load: () => import('./url-normalizer').then((m) => m.UrlNormalizer)
};
