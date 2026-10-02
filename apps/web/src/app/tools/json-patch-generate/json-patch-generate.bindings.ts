// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'json-patch-generate';
export const binding = {
    load: () => import('./json-patch-generate').then((m) => m.JsonPatchGenerate)
};
