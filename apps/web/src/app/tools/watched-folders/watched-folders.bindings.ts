// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'watched-folders';
export const binding = {
    load: () => import('./watched-folders').then((m) => m.WatchedFoldersTool)
};
