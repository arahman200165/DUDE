// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'cors-header-builder';
export const binding = {
    load: () => import('./cors-header-builder').then((m) => m.CorsHeaderBuilder)
};
