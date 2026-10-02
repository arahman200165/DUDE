// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'environment-variables';
export const binding = {
    load: () => import('./environment-variables').then((m) => m.EnvironmentVariablesTool)
};
