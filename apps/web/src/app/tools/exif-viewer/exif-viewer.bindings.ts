// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'exif-viewer';
export const binding = {
    load: () => import('./exif-viewer').then((m) => m.ExifViewer)
};
