// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'lorem-ipsum-generator';
export const binding = {
    load: () => import('./lorem-ipsum-generator').then((m) => m.LoremIpsumGenerator)
};
