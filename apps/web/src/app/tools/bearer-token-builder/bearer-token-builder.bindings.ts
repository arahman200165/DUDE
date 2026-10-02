// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'bearer-token-builder';
export const binding = {
    load: () => import('./bearer-token-builder').then((m) => m.BearerTokenBuilder)
};
