// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'duration-formatter';
export const binding = {
    load: () => import('./duration-formatter').then((m) => m.DurationFormatter)
};
