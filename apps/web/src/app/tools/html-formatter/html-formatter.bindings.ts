// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'html-formatter';
export const binding = {
    load: () => import('./html-formatter').then((m) => m.HtmlFormatter)
};
