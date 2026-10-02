// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'parquet-viewer';
export const binding = {
    load: () => import('./parquet-viewer').then((m) => m.ParquetViewer)
};
