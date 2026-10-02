// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'missing-env-var-detector';
export const binding = {
    load: () => import('./missing-env-var-detector').then((m) => m.MissingEnvVarDetector)
};
