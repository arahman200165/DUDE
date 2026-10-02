// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'string-similarity-calculator';
export const binding = {
    load: () => import('./string-similarity-calculator').then((m) => m.StringSimilarityCalculator)
};
