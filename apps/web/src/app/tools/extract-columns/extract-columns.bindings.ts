// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'extract-columns';
export const binding = {
    load: () => import('./extract-columns').then((m) => m.ExtractColumns)
};
