// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'whitespace-cleaner';
export const binding = {
    load: () => import('./whitespace-cleaner').then((m) => m.WhitespaceCleaner)
};
