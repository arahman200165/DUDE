// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'dst-transition-explorer';
export const binding = {
    load: () => import('./dst-transition-explorer').then((m) => m.DstTransitionExplorer)
};
