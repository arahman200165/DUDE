// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'tls-inspector';
export const binding = {
    load: () => import('./tls-inspector').then((m) => m.TlsInspectorTool)
};
