// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'basic-auth-generator';
export const binding = {
    load: () => import('./basic-auth-generator').then((m) => m.BasicAuthGenerator)
};
