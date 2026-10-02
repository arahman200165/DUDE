// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'file-lock-inspector';
export const binding = {
    load: () => import('./file-lock-inspector').then((m) => m.FileLockInspectorTool)
};
