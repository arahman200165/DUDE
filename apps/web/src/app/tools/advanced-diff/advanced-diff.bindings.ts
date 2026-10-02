// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'advanced-diff';
export const binding = {
    load: () => import('./advanced-diff').then((m) => m.AdvancedDiff)
};
