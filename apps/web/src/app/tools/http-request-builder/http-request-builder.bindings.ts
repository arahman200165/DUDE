// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'http-request-builder';
export const binding = {
    load: () => import('./http-request-builder').then((m) => m.HttpRequestBuilder)
};
