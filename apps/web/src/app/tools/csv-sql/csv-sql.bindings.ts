// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'csv-sql';
export const binding = {
    load: () => import('./csv-sql').then((m) => m.CsvSql)
};
