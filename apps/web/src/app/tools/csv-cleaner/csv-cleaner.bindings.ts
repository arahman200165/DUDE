// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'csv-cleaner';
export const binding = {
    load: () => import('./csv-cleaner').then((m) => m.CsvCleaner)
};
