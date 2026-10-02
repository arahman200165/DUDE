// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'base-n-encoder';
export const binding = {
    load: () => import('./base-n-encoder').then((m) => m.BaseNEncoder)
};
