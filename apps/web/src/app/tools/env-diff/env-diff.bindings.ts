// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'env-diff';
export const binding = {
    load: () => import('./env-diff').then((m) => m.EnvDiff)
};
