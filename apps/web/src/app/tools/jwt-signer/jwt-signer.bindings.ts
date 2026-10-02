// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'jwt-signer';
export const binding = {
    load: () => import('./jwt-signer').then((m) => m.JwtSigner)
};
