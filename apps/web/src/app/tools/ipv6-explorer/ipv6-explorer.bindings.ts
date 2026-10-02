// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'ipv6-explorer';
export const binding = {
    load: () => import('./ipv6-explorer').then((m) => m.Ipv6Explorer)
};
