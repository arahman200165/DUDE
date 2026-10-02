// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'http-status';
export const binding = {
    load: () => import('./http-status').then((m) => m.HttpStatus)
};
