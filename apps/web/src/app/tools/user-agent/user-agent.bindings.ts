// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'user-agent';
export const binding = {
    load: () => import('./user-agent').then((m) => m.UserAgent)
};
