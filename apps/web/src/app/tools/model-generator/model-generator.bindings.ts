// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'model-generator';
export const binding = {
    load: () => import('./model-generator').then((m) => m.ModelGenerator)
};
