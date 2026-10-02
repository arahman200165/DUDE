// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'byte-frequency-analyzer';
export const binding = {
    load: () => import('./byte-frequency-analyzer').then((m) => m.ByteFrequencyAnalyzer)
};
