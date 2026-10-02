// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'unicode-table';
export const binding = {
    load: () => import('./unicode-table').then((m) => m.UnicodeTable)
};
