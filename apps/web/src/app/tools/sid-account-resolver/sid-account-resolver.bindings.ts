// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'sid-account-resolver';
export const binding = {
    load: () => import('./sid-account-resolver').then((m) => m.SidAccountResolverTool)
};
