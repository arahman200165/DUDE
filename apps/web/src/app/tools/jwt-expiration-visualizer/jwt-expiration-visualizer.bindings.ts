// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'jwt-expiration-visualizer';
export const binding = {
    load: () => import('./jwt-expiration-visualizer').then((m) => m.JwtExpirationVisualizer)
};
