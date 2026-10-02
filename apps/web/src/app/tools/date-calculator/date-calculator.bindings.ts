// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'date-calculator';
export const binding = {
    load: () => import('./date-calculator').then((m) => m.DateCalculator)
};
