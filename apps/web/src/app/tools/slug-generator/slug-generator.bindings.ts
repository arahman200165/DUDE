// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'slug-generator';
export const binding = {
    load: () => import('./slug-generator').then((m) => m.SlugGenerator)
};
