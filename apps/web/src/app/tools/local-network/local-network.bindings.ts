// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'local-network';
export const binding = {
    load: () => import('./local-network').then((m) => m.LocalNetworkTool)
};
