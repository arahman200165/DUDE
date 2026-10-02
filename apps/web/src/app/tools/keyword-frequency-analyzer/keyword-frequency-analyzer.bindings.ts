// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'keyword-frequency-analyzer';
export const binding = {
    load: () => import('./keyword-frequency-analyzer').then((m) => m.KeywordFrequencyAnalyzer)
};
