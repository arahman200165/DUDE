// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'css-specificity-calculator';
export const binding = {
    load: () => import('./css-specificity-calculator').then((m) => m.CssSpecificityCalculator)
};
