// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'git-command-explainer';
export const binding = {
    load: () => import('./git-command-explainer').then((m) => m.GitCommandExplainer)
};
