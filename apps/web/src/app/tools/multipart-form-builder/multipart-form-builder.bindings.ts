// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'multipart-form-builder';
export const binding = {
    load: () => import('./multipart-form-builder').then((m) => m.MultipartFormBuilder)
};
