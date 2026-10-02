// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'process-diagnostic-bundle';
export const binding = {
    load: () => import('./process-diagnostic-bundle').then((m) => m.ProcessDiagnosticBundleTool)
};
