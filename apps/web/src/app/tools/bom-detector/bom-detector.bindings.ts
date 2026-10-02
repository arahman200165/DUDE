// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'bom-detector';
export const binding = {
    load: () => import('./bom-detector').then((m) => m.BomDetector)
};
