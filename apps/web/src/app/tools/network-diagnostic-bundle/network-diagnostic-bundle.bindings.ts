// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'network-diagnostic-bundle';
export const binding = {
    load: () => import('./network-diagnostic-bundle').then((m) => m.NetworkDiagnosticBundleTool)
};
