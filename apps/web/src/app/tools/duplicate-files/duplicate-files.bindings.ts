// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'duplicate-files';
export const binding = {
    load: () => import('./duplicate-files').then((m) => m.DuplicateFilesTool)
};
