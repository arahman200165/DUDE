// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'gitignore-generator';
export const binding = {
    load: () => import('./gitignore-generator').then((m) => m.GitignoreGenerator)
};
