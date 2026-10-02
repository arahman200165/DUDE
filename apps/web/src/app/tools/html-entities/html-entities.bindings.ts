// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'html-entities';
export const binding = {
    load: () => import('./html-entities').then((m) => m.HtmlEntities)
};
