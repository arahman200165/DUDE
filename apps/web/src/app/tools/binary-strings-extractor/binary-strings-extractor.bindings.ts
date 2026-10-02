// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'binary-strings-extractor';
export const binding = {
    load: () => import('./binary-strings-extractor').then((m) => m.BinaryStringsExtractor)
};
