// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'glob-tester';
export const binding = {
    load: () => import('./glob-tester').then((m) => m.GlobTester)
};
