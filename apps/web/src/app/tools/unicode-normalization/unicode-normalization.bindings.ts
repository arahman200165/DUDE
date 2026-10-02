// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'unicode-normalization';
export const binding = {
    load: () => import('./unicode-normalization').then((m) => m.UnicodeNormalization)
};
