// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'csv-delimiter-detector';
export const binding = {
    load: () => import('./csv-delimiter-detector').then((m) => m.CsvDelimiterDetector)
};
