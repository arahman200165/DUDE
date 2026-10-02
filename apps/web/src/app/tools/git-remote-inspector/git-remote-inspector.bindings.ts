// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'git-remote-inspector';
export const binding = {
    load: () => import('./git-remote-inspector').then((m) => m.GitRemoteInspector)
};
