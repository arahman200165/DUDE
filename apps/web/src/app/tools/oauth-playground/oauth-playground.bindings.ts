// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'oauth-playground';
export const binding = {
    load: () => import('./oauth-playground').then((m) => m.OAuthPlayground)
};
