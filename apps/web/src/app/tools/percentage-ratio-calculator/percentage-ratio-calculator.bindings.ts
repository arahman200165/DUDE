// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'percentage-ratio-calculator';
export const binding = {
    load: () => import('./percentage-ratio-calculator').then((m) => m.PercentageRatioCalculator)
};
