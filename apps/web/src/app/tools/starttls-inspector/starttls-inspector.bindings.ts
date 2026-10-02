// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'starttls-inspector';
export const binding = {
    load: () => import('./starttls-inspector').then((m) => m.StarttlsInspectorTool)
};
