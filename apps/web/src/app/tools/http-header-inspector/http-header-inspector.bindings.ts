// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'http-header-inspector';
export const binding = {
    load: () => import('./http-header-inspector').then((m) => m.HttpHeaderInspector)
};
