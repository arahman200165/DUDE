// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'http-digest-auth-helper';
export const binding = {
    load: () => import('./http-digest-auth-helper').then((m) => m.HttpDigestAuthHelper)
};
