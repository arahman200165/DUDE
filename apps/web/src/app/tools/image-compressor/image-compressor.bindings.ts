// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'image-compressor';
export const binding = {
    load: () => import('./image-compressor').then((m) => m.ImageCompressor)
};
