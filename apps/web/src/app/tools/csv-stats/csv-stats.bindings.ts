// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'csv-stats';
export const binding = {
    load: () => import('./csv-stats').then((m) => m.CsvStats)
};
