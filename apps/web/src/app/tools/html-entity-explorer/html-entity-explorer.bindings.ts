// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'html-entity-explorer';
export const binding = {
    load: () => import('./html-entity-explorer').then((m) => m.HtmlEntityExplorer)
};
