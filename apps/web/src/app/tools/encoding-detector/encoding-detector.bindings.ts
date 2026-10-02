// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'encoding-detector';
export const binding = {
    load: () => import('./encoding-detector').then((m) => m.EncodingDetector)
};
