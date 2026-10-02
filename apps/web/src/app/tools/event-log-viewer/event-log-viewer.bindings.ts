// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'event-log-viewer';
export const binding = {
    load: () => import('./event-log-viewer').then((m) => m.EventLogViewerTool)
};
