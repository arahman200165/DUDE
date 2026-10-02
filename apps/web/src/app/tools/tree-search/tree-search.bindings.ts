// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'tree-search';
export const binding = {
    load: () => import('./tree-search').then((m) => m.TreeSearchTool)
};
