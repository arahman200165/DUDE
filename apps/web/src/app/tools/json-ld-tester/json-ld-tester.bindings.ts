// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'json-ld-tester';
export const binding = {
    load: () => import('./json-ld-tester').then((m) => m.JsonLdTester)
};
