// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'json-patch-test';
export const binding = {
    load: () => import('./json-patch-test').then((m) => m.JsonPatchTest)
};
