// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'dom-tree-viewer';
export const binding = {
    load: () => import('./dom-tree-viewer').then((m) => m.DomTreeViewer)
};
