// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'jwt-verify';
export const binding = {
    load: () => import('./jwt-verify').then((m) => m.JwtVerify)
};
