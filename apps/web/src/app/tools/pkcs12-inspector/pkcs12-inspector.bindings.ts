// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'pkcs12-inspector';
export const binding = {
    load: () => import('./pkcs12-inspector').then((m) => m.Pkcs12Inspector)
};
