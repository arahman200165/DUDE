// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'content-disposition-builder';
export const binding = {
    load: () => import('./content-disposition-builder').then((m) => m.ContentDispositionBuilder)
};
