// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'oauth-scope-parser';
export const binding = {
    load: () => import('./oauth-scope-parser').then((m) => m.OAuthScopeParser)
};
