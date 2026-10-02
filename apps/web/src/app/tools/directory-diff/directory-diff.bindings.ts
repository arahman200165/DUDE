// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'directory-diff';
export const binding = {
    load: () => import('./directory-diff').then((m) => m.DirectoryDiff)
};
