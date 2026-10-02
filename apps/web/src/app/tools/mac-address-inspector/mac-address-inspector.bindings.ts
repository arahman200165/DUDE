// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'mac-address-inspector';
export const binding = {
    load: () => import('./mac-address-inspector').then((m) => m.MacAddressInspector)
};
