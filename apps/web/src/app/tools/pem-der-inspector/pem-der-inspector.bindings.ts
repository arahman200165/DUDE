// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'pem-der-inspector';
export const binding = {
    load: () => import('./pem-der-inspector').then((m) => m.PemDerInspector)
};
