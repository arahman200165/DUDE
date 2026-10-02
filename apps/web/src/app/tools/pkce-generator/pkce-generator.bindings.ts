// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'pkce-generator';
export const binding = {
    load: () => import('./pkce-generator').then((m) => m.PkceGenerator)
};
