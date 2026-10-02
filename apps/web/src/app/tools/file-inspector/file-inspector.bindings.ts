// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'file-inspector';
export const binding = {
    load: () => import('./file-inspector').then((m) => m.FileInspector)
};
