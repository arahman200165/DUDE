// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'gradient-generator';
export const binding = {
    load: () => import('./gradient-generator').then((m) => m.GradientGenerator)
};
