// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'file-split-join';
export const binding = {
    load: () => import('./file-split-join').then((m) => m.FileSplitJoinTool)
};
