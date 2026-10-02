// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'csp-builder';
export const binding = {
    load: () => import('./csp-builder').then((m) => m.CspBuilder)
};
