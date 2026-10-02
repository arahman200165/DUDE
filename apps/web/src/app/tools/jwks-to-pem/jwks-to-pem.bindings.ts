// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'jwks-to-pem';
export const binding = {
    load: () => import('./jwks-to-pem').then((m) => m.JwksToPem)
};
