// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'html-preview';
export const binding = {
    load: () => import('./html-preview').then((m) => m.HtmlPreview)
};
