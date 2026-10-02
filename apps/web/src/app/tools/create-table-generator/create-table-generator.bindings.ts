// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'create-table-generator';
export const binding = {
    load: () => import('./create-table-generator').then((m) => m.CreateTableGenerator)
};
