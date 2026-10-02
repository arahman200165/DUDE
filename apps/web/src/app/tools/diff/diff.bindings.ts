// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'diff';
export const binding = {
    load: () => import('./diff').then((m) => m.Diff)
};
