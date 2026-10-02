// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'jwt-claims-analyzer';
export const binding = {
    load: () => import('./jwt-claims-analyzer').then((m) => m.JwtClaimsAnalyzer)
};
