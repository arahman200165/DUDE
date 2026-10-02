// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'env-validator';
export const binding = {
    load: () => import('./env-validator').then((m) => m.EnvValidator)
};
