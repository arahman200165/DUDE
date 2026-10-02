// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'csv-dedupe';
export const binding = {
    load: () => import('./csv-dedupe').then((m) => m.CsvDedupe)
};
