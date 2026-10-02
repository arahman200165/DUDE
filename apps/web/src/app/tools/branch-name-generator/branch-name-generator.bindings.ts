// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'branch-name-generator';
export const binding = {
    load: () => import('./branch-name-generator').then((m) => m.BranchNameGenerator)
};
