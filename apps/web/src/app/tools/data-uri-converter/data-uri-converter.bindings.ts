// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'data-uri-converter';
export const binding = {
    load: () => import('./data-uri-converter').then((m) => m.DataUriConverter)
};
