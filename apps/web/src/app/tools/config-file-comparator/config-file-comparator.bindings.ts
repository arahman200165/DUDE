// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'config-file-comparator';
export const binding = {
    load: () => import('./config-file-comparator').then((m) => m.ConfigFileComparator)
};
