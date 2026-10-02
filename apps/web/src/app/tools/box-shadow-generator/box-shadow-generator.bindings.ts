// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'box-shadow-generator';
export const binding = {
    load: () => import('./box-shadow-generator').then((m) => m.BoxShadowGenerator)
};
