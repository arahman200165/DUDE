// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'resolution-calculator';
export const binding = {
    load: () => import('./resolution-calculator').then((m) => m.ResolutionCalculator)
};
