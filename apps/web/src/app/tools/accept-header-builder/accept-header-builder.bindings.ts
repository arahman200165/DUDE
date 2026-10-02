// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'accept-header-builder';
export const binding = {
    load: () => import('./accept-header-builder').then((m) => m.AcceptHeaderBuilder)
};
