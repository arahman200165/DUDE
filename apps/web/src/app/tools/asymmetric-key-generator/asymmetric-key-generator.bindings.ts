// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'asymmetric-key-generator';
export const binding = {
    load: () => import('./asymmetric-key-generator').then((m) => m.AsymmetricKeyGenerator)
};
