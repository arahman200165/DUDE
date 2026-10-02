// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'path-editor';
export const binding = {
    load: () => import('./path-editor').then((m) => m.PathEditorTool)
};
