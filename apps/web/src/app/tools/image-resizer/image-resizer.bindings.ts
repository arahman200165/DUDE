// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'image-resizer';
export const binding = {
    load: () => import('./image-resizer').then((m) => m.ImageResizer)
};
