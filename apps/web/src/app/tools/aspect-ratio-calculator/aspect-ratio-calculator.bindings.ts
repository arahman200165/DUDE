// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'aspect-ratio-calculator';
export const binding = {
    load: () => import('./aspect-ratio-calculator').then((m) => m.AspectRatioCalculator)
};
