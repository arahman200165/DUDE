// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'image-format-converter';
export const binding = {
    load: () => import('./image-format-converter').then((m) => m.ImageFormatConverter)
};
