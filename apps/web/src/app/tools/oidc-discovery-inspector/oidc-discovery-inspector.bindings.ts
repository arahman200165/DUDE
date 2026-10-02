// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'oidc-discovery-inspector';
export const binding = {
    load: () => import('./oidc-discovery-inspector').then((m) => m.OidcDiscoveryInspector)
};
