// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'curl-converter';
export const binding = {
    load: () => import('./curl-converter').then((m) => m.CurlConverter)
};
