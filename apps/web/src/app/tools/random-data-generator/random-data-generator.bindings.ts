// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'random-data-generator';
export const binding = {
    load: () => import('./random-data-generator').then((m) => m.RandomDataGenerator)
};
