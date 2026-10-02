// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'duplicate-finder';
export const binding = {
    load: () => import('./duplicate-finder').then((m) => m.DuplicateFinder)
};
