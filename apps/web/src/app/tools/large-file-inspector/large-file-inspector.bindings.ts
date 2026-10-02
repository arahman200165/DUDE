// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'large-file-inspector';
export const binding = {
    load: () => import('./large-file-inspector').then((m) => m.LargeFileInspectorTool)
};
