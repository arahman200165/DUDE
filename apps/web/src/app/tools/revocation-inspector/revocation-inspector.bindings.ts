// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'revocation-inspector';
export const binding = {
    load: () => import('./revocation-inspector').then((m) => m.RevocationInspectorTool)
};
