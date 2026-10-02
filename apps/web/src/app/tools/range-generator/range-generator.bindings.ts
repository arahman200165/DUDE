// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'range-generator';
export const binding = {
    load: () => import('./range-generator').then((m) => m.RangeGenerator)
};
