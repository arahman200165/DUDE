// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'git-diff';
export const binding = {
    load: () => import('./git-diff').then((m) => m.GitDiff)
};
