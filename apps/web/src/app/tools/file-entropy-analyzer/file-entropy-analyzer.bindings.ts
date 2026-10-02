// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'file-entropy-analyzer';
export const binding = {
    load: () => import('./file-entropy-analyzer').then((m) => m.FileEntropyAnalyzer)
};
