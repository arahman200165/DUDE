// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'gitignore-tester';
export const binding = {
    load: () => import('./gitignore-tester').then((m) => m.GitignoreTester)
};
