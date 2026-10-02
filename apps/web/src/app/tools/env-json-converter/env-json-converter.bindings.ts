// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'env-json-converter';
export const binding = {
    load: () => import('./env-json-converter').then((m) => m.EnvJsonConverter)
};
