// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'sqlite-viewer';
export const binding = {
    load: () => import('./sqlite-viewer').then((m) => m.SqliteViewer)
};
