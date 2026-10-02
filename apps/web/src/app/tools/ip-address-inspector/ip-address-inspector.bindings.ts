// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'ip-address-inspector';
export const binding = {
    load: () => import('./ip-address-inspector').then((m) => m.IpAddressInspector)
};
