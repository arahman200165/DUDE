// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'ascii-table';
export const binding = {
    load: () => import('./ascii-table').then((m) => m.AsciiTable)
};
