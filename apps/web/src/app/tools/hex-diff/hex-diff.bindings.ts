// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'hex-diff';
export const binding = {
    load: () => import('./hex-diff').then((m) => m.HexDiff)
};
