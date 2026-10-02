// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'https-config-analyzer';
export const binding = {
    load: () => import('./https-config-analyzer').then((m) => m.HttpsConfigAnalyzerTool)
};
