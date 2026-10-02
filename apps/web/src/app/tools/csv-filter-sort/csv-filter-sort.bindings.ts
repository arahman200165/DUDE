// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'csv-filter-sort';
export const binding = {
    load: () => import('./csv-filter-sort').then((m) => m.CsvFilterSort)
};
