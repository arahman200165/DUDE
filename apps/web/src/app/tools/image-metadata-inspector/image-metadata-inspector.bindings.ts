// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'image-metadata-inspector';
export const binding = {
    load: () => import('./image-metadata-inspector').then((m) => m.ImageMetadataInspector)
};
