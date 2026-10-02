// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'secret-detector';
export const binding = {
    load: () => import('./secret-detector').then((m) => m.SecretDetector)
};
