// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'csv-join';
export const binding = {
    load: () => import('./csv-join').then((m) => m.CsvJoin)
};
