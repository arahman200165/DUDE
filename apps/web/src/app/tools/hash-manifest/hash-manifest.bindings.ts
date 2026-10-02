// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'hash-manifest';
export const binding = {
    load: () => import('./hash-manifest').then((m) => m.HashManifestTool)
};
