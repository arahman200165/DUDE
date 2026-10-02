// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'dpi-calculator';
export const binding = {
    load: () => import('./dpi-calculator').then((m) => m.DpiCalculator)
};
