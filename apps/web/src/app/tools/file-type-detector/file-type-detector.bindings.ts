// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'file-type-detector';
export const binding = {
    load: () => import('./file-type-detector').then((m) => m.FileTypeDetector)
};
