// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'http-response-viewer';
export const binding = {
    load: () => import('./http-response-viewer').then((m) => m.HttpResponseViewer)
};
