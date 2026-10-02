// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'mime-types';
export const binding = {
    load: () => import('./mime-types').then((m) => m.MimeTypes)
};
