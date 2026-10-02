// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'packet-loss';
export const binding = {
    load: () => import('./packet-loss').then((m) => m.PacketLossTool)
};
