// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'csr-generator-inspector';
export const binding = {
    load: () => import('./csr-generator-inspector').then((m) => m.CsrGeneratorInspector)
};
