// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'env-editor';
export const binding = {
    load: () => import('./env-editor').then((m) => m.EnvEditor)
};
