// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'hex-dump';
export const binding = {
    load: () => import('./hex-dump').then((m) => m.HexDumpTool)
};
