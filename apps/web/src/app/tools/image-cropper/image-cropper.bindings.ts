// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'image-cropper';
export const binding = {
    load: () => import('./image-cropper').then((m) => m.ImageCropper)
};
