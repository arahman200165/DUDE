// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'cache-control-builder';
export const binding = {
    load: () => import('./cache-control-builder').then((m) => m.CacheControlBuilder)
};
