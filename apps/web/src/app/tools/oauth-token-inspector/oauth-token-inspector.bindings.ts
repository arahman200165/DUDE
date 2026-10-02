// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'oauth-token-inspector';
export const binding = {
    load: () => import('./oauth-token-inspector').then((m) => m.OAuthTokenInspector)
};
