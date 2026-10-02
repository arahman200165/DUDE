// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'meta-tag-generator';
export const binding = {
    load: () => import('./meta-tag-generator').then((m) => m.MetaTagGenerator)
};
