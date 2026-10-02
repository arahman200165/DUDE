// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'folder-size-analyzer';
export const binding = {
    load: () => import('./folder-size-analyzer').then((m) => m.FolderSizeAnalyzerTool)
};
