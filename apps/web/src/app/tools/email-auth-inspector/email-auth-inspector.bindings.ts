// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'email-auth-inspector';
export const binding = {
    load: () => import('./email-auth-inspector').then((m) => m.EmailAuthInspectorTool)
};
