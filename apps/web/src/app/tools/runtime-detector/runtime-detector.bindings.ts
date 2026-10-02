// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'runtime-detector';
export const binding = {
    load: () => import('./runtime-detector').then((m) => m.RuntimeDetectorTool)
};
