// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'hostname-resolver';
export const binding = {
    load: () => import('./hostname-resolver').then((m) => m.HostnameResolverTool)
};
