// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'git-command-builder';
export const binding = {
    load: () => import('./git-command-builder').then((m) => m.GitCommandBuilder)
};
