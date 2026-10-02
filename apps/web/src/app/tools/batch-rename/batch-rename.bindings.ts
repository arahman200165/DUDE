// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'batch-rename';
export const binding = {
    load: () => import('./batch-rename').then((m) => m.BatchRenameTool)
};
