// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'pkce-verifier';
export const binding = {
    load: () => import('./pkce-verifier').then((m) => m.PkceVerifier)
};
