// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'csv-pivot';
export const binding = {
    load: () => import('./csv-pivot').then((m) => m.CsvPivot)
};
