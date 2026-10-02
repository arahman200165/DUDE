// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'mtu-discovery';
export const binding = {
    load: () => import('./mtu-discovery').then((m) => m.MtuDiscoveryTool)
};
