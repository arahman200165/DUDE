// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'unix-timestamp';
export const binding = {
    load: () => import('./unix-timestamp').then((m) => m.UnixTimestamp)
};
