// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'jwt';
export const binding = {
    load: () => import('./jwt').then((m) => m.Jwt)
};
