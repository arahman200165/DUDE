// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'hex-text-converter';
export const binding = {
    load: () => import('./hex-text-converter').then((m) => m.HexTextConverter)
};
