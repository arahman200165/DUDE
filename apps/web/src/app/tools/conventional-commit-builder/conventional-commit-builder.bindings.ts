// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'conventional-commit-builder';
export const binding = {
    load: () => import('./conventional-commit-builder').then((m) => m.ConventionalCommitBuilder)
};
