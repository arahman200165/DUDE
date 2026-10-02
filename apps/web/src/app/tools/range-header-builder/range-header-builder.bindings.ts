// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'range-header-builder';
export const binding = {
    load: () => import('./range-header-builder').then((m) => m.RangeHeaderBuilder)
};
