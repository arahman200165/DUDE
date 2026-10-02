// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'csv-viewer';
export const binding = {
    load: () => import('./csv-viewer').then((m) => m.CsvViewer)
};
